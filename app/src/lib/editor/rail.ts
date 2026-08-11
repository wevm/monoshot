import { StateEffect, StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { Theme } from 'monoshot'
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
    if (!transaction.docChanged || value === undefined) return value
    // A row is named by its line, and setting a mark can write a line above it:
    // carried through the edit, so the controls stay beside the row they were
    // beside rather than beside its number.
    const [kind, number] = value.split(':')
    const line = Number(number)
    if (!kind || !line || line > transaction.startState.doc.lines) return undefined
    const at = transaction.changes.mapPos(transaction.startState.doc.line(line).from)
    return `${kind}:${transaction.state.doc.lineAt(at).number}`
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

/** A press held down the rows, and what it has done on the way. */
type Painting = {
  kind: Notations.Kind
  /** Where the press started, so the rows it covers are the ones between. */
  origin: number
  /** Where a row was changed, so sliding back off it puts the row back. */
  changed: Set<number>
  set: boolean
}

/** What a row on screen offers: marks for a line of code, or one way out. */
type Row = {
  /** Where a kept complaint was taken from, on a row that draws one. */
  at?: number | undefined
  carried?: readonly Notations.Kind[] | undefined
  height: number
  key: string
  line?: number | undefined
  takes?: boolean | undefined
  top: number
}

/**
 * One strip, moved to the row being reached for rather than one per row: the
 * controls travel between rows instead of appearing somewhere else, and there
 * is only ever one of them to build.
 *
 * The rows themselves are covered by their own reaches, which tile the side of
 * the window so running down it runs down the code without a gap to fall
 * through.
 */
class Rail {
  private readonly strip = document.createElement('div')
  /** What covers each row on screen, by what that row is. */
  private reaches = new Map<string, HTMLElement>()
  /** What each row offers, read back when the strip moves onto it. */
  private rows = new Map<string, Row>()
  /** The row the strip is built for, so it is rebuilt only when it moves. */
  private showing: string | undefined
  /** The mark a press is carrying down the rows, while it is held. */
  private painting: Painting | undefined
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
    this.strip.className = 'rail'
    this.strip.style.setProperty('--rail-gap', `${gap}px`)
    container.appendChild(this.strip)
    view.dom.addEventListener('mousemove', this.track)
    view.dom.addEventListener('mouseover', this.track)
    view.dom.addEventListener('mouseleave', this.clear)
    this.container.addEventListener('mouseleave', this.clear)
    // On the window: a press carrying a mark down the rows can be let go
    // anywhere, and the rows are not where the pointer has to be by then.
    window.addEventListener('mouseup', this.drop)
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
    window.removeEventListener('mouseup', this.drop)
    this.container.replaceChildren()
    this.reaches.clear()
  }

  /**
   * Which row the pointer is over, read by what it is over rather than by
   * position: a complaint draws between two lines, and a position would name
   * one of them.
   */
  private readonly track = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest('.cm-objection') : null
    if (target) return this.reach(`pin:${this.lineOf(target)}`)
    const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    this.reach(`line:${this.view.state.doc.lineAt(position).number}`)
  }

  private readonly clear = () => this.reach(undefined)

  private readonly drop = () => {
    this.painting = undefined
  }

  private reach(key: string | undefined) {
    if (this.view.state.field(reached, false) === key) return
    this.view.dispatch({ effects: reach.of(key) })
  }

  /** The line a complaint drawn under it belongs to. */
  private lineOf(objection: Element) {
    return this.view.state.doc.lineAt(this.view.posAtDOM(objection)).number
  }

  /**
   * Measures the rows and covers each one. Measured through CodeMirror rather
   * than during an update, which would read a layout the update is still
   * writing.
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
            position = line.to + 1
            // A row closed up because it holds a notation and nothing else is
            // not on screen to be reached for.
            if (block.height === 0) continue
            rows.push({
              carried: Notations.at(view.state, line.number).map((notation) => notation.kind),
              height: block.height,
              key: `line:${line.number}`,
              line: line.number,
              takes: Notations.takesMark(view.state, line.number),
              // The document's own top, so a scrolled row still lands beside
              // itself.
              top: view.documentTop + block.top - host.top,
            })
          }
        }
        // Read off the rows themselves: a complaint is drawn between two lines,
        // which the geometry of either one does not describe.
        for (const drawn of view.dom.querySelectorAll('.cm-objection')) {
          const line = this.lineOf(drawn)
          const at = keptUnder(view.state, line)
          if (at === undefined) continue
          const box = drawn.getBoundingClientRect()
          rows.push({ at, height: box.height, key: `pin:${line}`, top: box.top - host.top })
        }
        return { left: view.dom.getBoundingClientRect().right - host.left + gap, rows }
      },
      write: (measured) => {
        // A measure asked for before this was replaced still runs, and what it
        // would build is something nothing owns.
        if (this.gone) return
        const stale = new Set(this.reaches.keys())
        this.rows.clear()
        for (const row of measured.rows) {
          stale.delete(row.key)
          this.rows.set(row.key, row)
          const cover = this.reaches.get(row.key) ?? this.cover(row.key)
          this.reaches.set(row.key, cover)
          cover.style.setProperty('--rail-left', `${Math.round(measured.left)}px`)
          cover.style.setProperty('--rail-top', `${Math.round(row.top)}px`)
          cover.style.setProperty('--rail-height', `${Math.round(row.height)}px`)
        }
        for (const key of stale) {
          this.reaches.get(key)?.remove()
          this.reaches.delete(key)
        }
        this.strip.style.setProperty('--rail-left', `${Math.round(measured.left)}px`)
        // Rebuilt where it stands: what a row offers can change under it.
        this.showing = undefined
        this.show(this.view.state.field(reached, false))
      },
    })
  }

  /** Moves the strip onto the row being reached for, and builds what it offers. */
  private show(key: string | undefined) {
    const row = key === undefined ? undefined : this.rows.get(key)
    if (!row) {
      delete this.strip.dataset['shown']
      this.showing = undefined
      return
    }
    // Centred on the row rather than hung from its top: the strip is its own
    // padding taller than the control inside it.
    this.strip.style.setProperty('--rail-top', `${Math.round(row.top + row.height / 2)}px`)
    this.strip.dataset['shown'] = ''
    if (this.showing === key) return
    this.showing = key
    this.strip.replaceChildren(...this.controls(row))
  }

  /** A transparent cover over a row, which is what notices the pointer on it. */
  private cover(key: string) {
    const cover = document.createElement('div')
    cover.className = 'rail-reach'
    cover.style.setProperty('--rail-gap', `${gap}px`)
    cover.addEventListener('mouseenter', () => {
      this.reach(key)
      // A press held from another row reaches this one, so a run of lines takes
      // the mark in one gesture.
      const line = this.rows.get(key)?.line
      if (this.painting && line !== undefined) this.spread(line)
    })
    this.container.appendChild(cover)
    return cover
  }

  /** What a row offers: the marks it can carry, or the one way out of it. */
  private controls(row: Row) {
    const { at, line } = row
    if (line === undefined)
      return at === undefined
        ? []
        : [
            this.control({
              // Set, since the complaint being on screen is what this row is.
              active: true,
              // The glyph that pinned it, in the hue the complaint carries: the
              // one thing this offers is to take it back.
              color: Theme.marks.remove,
              icon: Annotation.pin,
              label: 'Unpin this message',
              select: () => keep(this.view, at),
            }),
          ]
    return order.map((kind) => {
      const button = this.control({
        active: row.takes === true && row.carried?.includes(kind) === true,
        hold: () => {
          // What the press decides for the row it started on is what it carries
          // to every row it reaches, rather than flipping each in turn.
          this.painting = {
            changed: new Set(),
            kind,
            origin: this.view.state.doc.line(line).from,
            set: row.carried?.includes(kind) !== true,
          }
          this.spread(line)
        },
        icon: icons[kind],
        label: row.takes === true ? labels[kind] : blank,
        select: () => this.toggle(line, kind),
      })
      button.dataset['kind'] = kind
      button.disabled = row.takes !== true
      return button
    })
  }

  /** One control of the strip, whichever the strip is. */
  private control(options: {
    active?: boolean | undefined
    color?: string | undefined
    /** What a press by pointer does, when it does more than a press by key. */
    hold?: (() => void) | undefined
    icon: string
    label: string
    select: () => void
  }) {
    const button = document.createElement('button')
    button.className = 'rail-control'
    if (options.active) button.dataset['active'] = ''
    if (options.color) button.style.setProperty('--rail-color', options.color)
    button.type = 'button'
    button.title = options.label
    button.setAttribute('aria-label', options.label)
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${options.icon}"/></svg>`
    // Ahead of the click: the editor would otherwise take focus and drop the
    // caret on whatever the control sits over.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      options.hold?.()
    })
    // A press by key reports no click count, and has no drag to carry.
    button.addEventListener('click', (event) => {
      if (!options.hold || event.detail === 0) options.select()
    })
    return button
  }

  /**
   * Marks the rows the press now covers, and puts back the ones it has slid off:
   * a drag says which rows, and dragging back over them takes them out again.
   */
  private spread(line: number) {
    const painting = this.painting
    if (!painting) return
    const { doc } = this.view.state
    const origin = doc.lineAt(painting.origin).number
    const from = Math.min(origin, line)
    const to = Math.max(origin, line)
    for (const at of [...painting.changed]) {
      const number = doc.lineAt(at).number
      if (number >= from && number <= to) continue
      painting.changed.delete(at)
      this.apply(number, painting.kind, !painting.set)
    }
    for (let number = from; number <= to; number++) {
      const at = this.view.state.doc.line(number).from
      if (painting.changed.has(at)) continue
      if (this.apply(number, painting.kind, painting.set)) painting.changed.add(at)
    }
  }

  /**
   * Sets or clears a mark on a row, leaving one already that way alone. Says
   * whether it changed anything, since only what changed is put back.
   */
  private apply(line: number, kind: Notations.Kind, set: boolean) {
    const { state } = this.view
    if (line > state.doc.lines || !Notations.takesMark(state, line)) return false
    const carries = Notations.at(state, line).some((notation) => notation.kind === kind)
    if (carries === set) return false
    this.toggle(line, kind)
    return true
  }

  private toggle(line: number, kind: Notations.Kind) {
    const { state } = this.view
    // Refused here rather than only on the control: a blank line carrying a mark
    // of its own would be taken away along with it.
    if (line > state.doc.lines || !Notations.takesMark(state, line)) return
    const transaction = state.update({
      changes: Notations.toggle(state, { kind, line, syntax: this.syntax }),
      // The caret stays where the writer left it rather than jumping to the mark
      // they set.
      selection: state.selection,
    })
    this.view.dispatch(transaction)
    // Setting focus writes a line, so what a press is holding onto moves: the
    // rows it covers are the same rows at their new offsets.
    const painting = this.painting
    if (!painting) return
    painting.origin = transaction.changes.mapPos(painting.origin)
    const changed = [...painting.changed].map((at) => transaction.changes.mapPos(at))
    painting.changed.clear()
    for (const at of changed) painting.changed.add(at)
  }
}
