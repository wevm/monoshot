import { StateEffect, StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'

import * as Annotation from './annotation.js'
import * as Notations from './notations.js'
import { keep, keptUnder } from './problems.js'

// Lucide, at the size a control is set in: scan, highlighter, plus, minus.
const icons: Readonly<Record<Notations.Kind, string>> = {
  add: 'M5 12h14M12 5v14',
  focus:
    'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2',
  highlight: 'm9 11-6 6v3h9l3-3m10-5-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  remove: 'M5 12h14',
}

const labels: Readonly<Record<Notations.Kind, string>> = {
  add: 'Mark as added',
  focus: 'Focus this line',
  highlight: 'Highlight this line',
  remove: 'Mark as removed',
}

const order = ['focus', 'highlight', 'add', 'remove'] as const

/** Why a blank line offers no marks, since its controls cannot say so. */
const blank = 'A blank line takes no mark'

/**
 * How far the controls stand off the window's edge: past the grip that resizes
 * it, which reaches 8px into the margin and is the more important thing to hit.
 */
const gap = 10

/** The row being reached for, from either the code or the controls beside it. */
const reach = StateEffect.define<string | undefined>()

/**
 * Which row the controls stand beside. The row itself is left alone: it says
 * nothing about the code, and a wash under the pointer is not what the artwork
 * is for.
 */
const reached = StateField.define<string | undefined>({
  create: () => undefined,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(reach)) return effect.value
    return value
  },
})

/**
 * Offers every line the marks it can carry, so they can be set by pointer rather
 * than by typing the comment. The control for a mark the line already carries
 * turns it back off, which is how a hidden notation is taken away.
 *
 * The controls stand outside the window, which clips whatever is drawn in it, so
 * they are built into a host the artwork provides. Running down the strips runs
 * down the lines with them.
 */
export function rail(options: rail.Options): Extension {
  const { container, syntax } = options
  if (!container) return []
  return [reached, ViewPlugin.define((view) => new Rail(view, container, syntax))]
}

export declare namespace rail {
  type Options = {
    /** Where the controls are drawn, outside the window and over the artwork. */
    container: HTMLElement | null
    /** The comment a mark is written as, in the language of the snippet. */
    syntax: Notations.Syntax
  }
}

/** What a row on screen offers: marks for a line of code, or one way out. */
type Row = {
  /** Where a kept complaint was taken from, on a row that draws one. */
  at?: number | undefined
  carried?: readonly Notations.Kind[] | undefined
  key: string
  line?: number | undefined
  takes?: boolean | undefined
  top: number
}

class Rail {
  /** One strip per row on screen, by what that row is. */
  private strips = new Map<string, HTMLElement>()
  /** Whether this has been replaced, which a measure already asked for outlives. */
  private gone = false

  constructor(
    readonly view: EditorView,
    readonly container: HTMLElement,
    readonly syntax: Notations.Syntax,
  ) {
    // The host is this plugin's alone, so whatever is in it belongs to a
    // predecessor: reconfiguring the editor leaves one behind.
    container.replaceChildren()
    view.dom.addEventListener('mousemove', this.track)
    view.dom.addEventListener('mouseover', this.track)
    view.dom.addEventListener('mouseleave', this.clear)
    this.container.addEventListener('mouseleave', this.clear)
    this.render()
  }

  update(update: ViewUpdate) {
    const row = update.state.field(reached)
    if (update.docChanged || update.viewportChanged || update.geometryChanged) return this.render()
    if (row !== update.startState.field(reached)) this.show(row)
  }

  destroy() {
    this.gone = true
    this.view.dom.removeEventListener('mousemove', this.track)
    this.view.dom.removeEventListener('mouseover', this.track)
    this.view.dom.removeEventListener('mouseleave', this.clear)
    this.container.removeEventListener('mouseleave', this.clear)
    for (const strip of this.strips.values()) strip.remove()
    this.strips.clear()
  }

  /**
   * Which row the pointer is over, read by height rather than by position: a
   * complaint draws between two lines, and a position would name one of them.
   */
  private readonly track = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest('.cm-objection') : null
    // A complaint draws between two lines, so a position under the pointer
    // would name one of them rather than the row itself.
    if (target) return this.reach(`pin:${this.lineOf(target)}`)
    const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    this.reach(`line:${this.view.state.doc.lineAt(position).number}`)
  }

  /** The line a complaint drawn under it belongs to. */
  private lineOf(objection: Element) {
    return this.view.state.doc.lineAt(this.view.posAtDOM(objection)).number
  }

  private readonly clear = () => this.reach(undefined)

  private reach(key: string | undefined) {
    if (this.view.state.field(reached, false) === key) return
    this.view.dispatch({ effects: reach.of(key) })
  }

  /**
   * Rebuilds the strips and places them beside their lines. Measured through
   * CodeMirror rather than during an update, which would read a layout the
   * update is still writing.
   */
  private render() {
    if (this.gone) return
    this.view.requestMeasure({
      read: (view) => {
        const host = this.container.getBoundingClientRect()
        const rows: Row[] = []
        for (const { from, to } of view.visibleRanges) {
          let position = from
          while (position <= to) {
            const line = view.state.doc.lineAt(position)
            const block = view.lineBlockAt(line.from)
            rows.push({
              carried: Notations.at(view.state, line.number).map((notation) => notation.kind),
              key: `line:${line.number}`,
              line: line.number,
              takes: Notations.takesMark(view.state, line.number),
              // The document's own top, so a scrolled row still lands beside
              // itself.
              top: view.documentTop + block.top - host.top,
            })
            position = line.to + 1
          }
        }
        // Read off the rows themselves: a complaint is drawn between two lines,
        // which the geometry of either one does not describe.
        for (const drawn of view.dom.querySelectorAll('.cm-objection')) {
          const line = this.lineOf(drawn)
          const at = keptUnder(view.state, line)
          if (at === undefined) continue
          rows.push({ at, key: `pin:${line}`, top: drawn.getBoundingClientRect().top - host.top })
        }
        return { left: view.dom.getBoundingClientRect().right - host.left + gap, rows }
      },
      write: (measured) => {
        // A measure asked for before this was replaced still runs, and the
        // strips it would build are ones nothing owns.
        if (this.gone) return
        const stale = new Set(this.strips.keys())
        for (const row of measured.rows) {
          stale.delete(row.key)
          const strip = this.strips.get(row.key) ?? this.build(row)
          this.strips.set(row.key, strip)
          strip.style.setProperty('--rail-left', `${Math.round(measured.left)}px`)
          strip.style.setProperty('--rail-top', `${Math.round(row.top)}px`)
          if (row.line === undefined) continue
          for (const button of strip.querySelectorAll('button')) {
            button.disabled = !row.takes
            button.title = row.takes ? labels[button.dataset['kind'] as Notations.Kind] : blank
            if (row.takes && row.carried?.includes(button.dataset['kind'] as Notations.Kind))
              button.dataset['active'] = ''
            else delete button.dataset['active']
          }
        }
        for (const key of stale) {
          this.strips.get(key)?.remove()
          this.strips.delete(key)
        }
        this.show(this.view.state.field(reached, false))
      },
    })
  }

  /** Only the row being reached for shows its controls. */
  private show(key: string | undefined) {
    for (const [own, strip] of this.strips)
      if (own === key) strip.dataset['shown'] = ''
      else delete strip.dataset['shown']
  }

  private build(row: Row) {
    const strip = document.createElement('div')
    strip.className = 'rail'
    // Read by the strip's own reach back toward the window, so the gap it
    // stands off and the gap it carries cannot disagree.
    strip.style.setProperty('--rail-gap', `${gap}px`)
    // A strip covers its row's full height, so the strips tile the side of the
    // window: running down them runs down the rows without a gap between.
    strip.addEventListener('mouseenter', () => this.reach(row.key))
    this.container.appendChild(strip)
    const { at, line } = row
    if (line === undefined) {
      if (at !== undefined)
        strip.appendChild(
          Annotation.control({
            label: 'Remove this message',
            select: () => keep(this.view, at),
          }),
        )
      return strip
    }
    for (const kind of order) {
      const button = document.createElement('button')
      button.className = 'rail-control'
      button.dataset['kind'] = kind
      button.type = 'button'
      button.title = labels[kind]
      button.setAttribute('aria-label', labels[kind])
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[kind]}"/></svg>`
      // Ahead of the click: the editor would otherwise take focus and drop the
      // caret on whatever the control sits over.
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => this.toggle(line, kind))
      strip.appendChild(button)
    }
    return strip
  }

  private toggle(line: number, kind: Notations.Kind) {
    const { state } = this.view
    // Refused here rather than only on the control: a blank line carrying a mark
    // of its own would be taken away along with it.
    if (line > state.doc.lines || !Notations.takesMark(state, line)) return
    this.view.dispatch({
      changes: Notations.toggle(state, { kind, line, syntax: this.syntax }),
      // The caret stays where the writer left it rather than jumping to the mark
      // they set.
      selection: state.selection,
    })
  }
}
