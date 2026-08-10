import { StateEffect, StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'

import * as Notations from './notations.js'

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

/** How far the controls stand off the window's edge. */
const gap = 8

/** The line being reached for, from either the code or the controls beside it. */
const reach = StateEffect.define<number | undefined>()

const reached = StateField.define<number | undefined>({
  create: () => undefined,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(reach)) return effect.value
    return value
  },
  provide: (self) =>
    EditorView.decorations.compute([self, 'doc'], (state) => {
      const line = state.field(self)
      if (line === undefined || line > state.doc.lines) return Decoration.none
      return Decoration.set(hovered.range(state.doc.line(line).from))
    }),
})

const hovered = Decoration.line({ class: 'cm-reached' })

/**
 * Offers every line the marks it can carry, so they can be set by pointer rather
 * than by typing the comment. The control for a mark the line already carries
 * turns it back off, which is how a hidden notation is taken away.
 *
 * The controls stand outside the window, which clips whatever is drawn in it, so
 * they are built into a host the artwork provides. Reaching for one lights its
 * line, and running down the strip runs down the code with it.
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

class Rail {
  /** One strip per line on screen, by line number. */
  private strips = new Map<number, HTMLElement>()

  constructor(
    readonly view: EditorView,
    readonly container: HTMLElement,
    readonly syntax: Notations.Syntax,
  ) {
    view.dom.addEventListener('mousemove', this.track)
    view.dom.addEventListener('mouseover', this.track)
    view.dom.addEventListener('mouseleave', this.clear)
    this.container.addEventListener('mouseleave', this.clear)
    this.render()
  }

  update(update: ViewUpdate) {
    const line = update.state.field(reached)
    if (update.docChanged || update.viewportChanged || update.geometryChanged) return this.render()
    if (line !== update.startState.field(reached)) this.show(line)
  }

  destroy() {
    this.view.dom.removeEventListener('mousemove', this.track)
    this.view.dom.removeEventListener('mouseover', this.track)
    this.view.dom.removeEventListener('mouseleave', this.clear)
    this.container.removeEventListener('mouseleave', this.clear)
    for (const strip of this.strips.values()) strip.remove()
    this.strips.clear()
  }

  /** Which line the pointer is over, wherever in the code it is. */
  private readonly track = (event: MouseEvent) => {
    const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    this.reach(this.view.state.doc.lineAt(position).number)
  }

  private readonly clear = () => this.reach(undefined)

  private reach(line: number | undefined) {
    if (this.view.state.field(reached, false) === line) return
    this.view.dispatch({ effects: reach.of(line) })
  }

  /**
   * Rebuilds the strips and places them beside their lines. Measured through
   * CodeMirror rather than during an update, which would read a layout the
   * update is still writing.
   */
  private render() {
    this.view.requestMeasure({
      read: (view) => {
        const host = this.container.getBoundingClientRect()
        const lines = []
        for (const { from, to } of view.visibleRanges) {
          let position = from
          while (position <= to) {
            const line = view.state.doc.lineAt(position)
            const block = view.lineBlockAt(line.from)
            lines.push({
              carried: Notations.at(view.state, line.number).map((notation) => notation.kind),
              // The document's own top, so a scrolled line still lands beside
              // itself.
              top: view.documentTop + block.top - host.top,
              number: line.number,
            })
            position = line.to + 1
          }
        }
        return { left: view.dom.getBoundingClientRect().right - host.left + gap, lines }
      },
      write: (measured) => {
        const stale = new Set(this.strips.keys())
        for (const line of measured.lines) {
          stale.delete(line.number)
          const strip = this.strips.get(line.number) ?? this.build(line.number)
          this.strips.set(line.number, strip)
          strip.style.setProperty('--rail-left', `${Math.round(measured.left)}px`)
          strip.style.setProperty('--rail-top', `${Math.round(line.top)}px`)
          for (const button of strip.querySelectorAll('button'))
            if (line.carried.includes(button.dataset['kind'] as Notations.Kind))
              button.dataset['active'] = ''
            else delete button.dataset['active']
        }
        for (const number of stale) {
          this.strips.get(number)?.remove()
          this.strips.delete(number)
        }
        this.show(this.view.state.field(reached, false))
      },
    })
  }

  /** Only the line being reached for shows its controls. */
  private show(line: number | undefined) {
    for (const [number, strip] of this.strips)
      if (number === line) strip.dataset['shown'] = ''
      else delete strip.dataset['shown']
  }

  private build(line: number) {
    const strip = document.createElement('div')
    strip.className = 'rail'
    // A strip covers its line's full height, so the strips tile the side of the
    // window: running down them runs down the lines without a gap between.
    strip.addEventListener('mouseenter', () => this.reach(line))
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
    this.container.appendChild(strip)
    return strip
  }

  private toggle(line: number, kind: Notations.Kind) {
    const { state } = this.view
    if (line > state.doc.lines) return
    this.view.dispatch({
      changes: Notations.toggle(state, { kind, line, syntax: this.syntax }),
      // The caret stays where the writer left it rather than jumping to the mark
      // they set.
      selection: state.selection,
    })
  }
}
