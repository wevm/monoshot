import type { Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
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

/**
 * Offers each line the marks it can carry, so they can be set by pointer rather
 * than by typing the comment. The control a line already carries turns its mark
 * back off, which is how a hidden notation is taken away.
 *
 * One strip, moved to the line under the pointer, rather than a control per
 * line: a long document would otherwise build hundreds of them.
 */
export function rail(syntax: Notations.Syntax): Extension {
  return ViewPlugin.define((view) => new Rail(view, syntax))
}

class Rail {
  readonly dom = document.createElement('div')
  private line: number | undefined
  private readonly buttons = new Map<Notations.Kind, HTMLButtonElement>()

  constructor(
    readonly view: EditorView,
    readonly syntax: Notations.Syntax,
  ) {
    this.dom.className = 'cm-rail'
    for (const kind of order) {
      const button = document.createElement('button')
      button.className = 'cm-rail-control'
      button.dataset['kind'] = kind
      button.type = 'button'
      button.title = labels[kind]
      button.setAttribute('aria-label', labels[kind])
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[kind]}"/></svg>`
      // Ahead of the click: the editor would otherwise take focus and drop the
      // caret on whatever the control sits over.
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => this.toggle(kind))
      this.buttons.set(kind, button)
      this.dom.appendChild(button)
    }
    view.dom.appendChild(this.dom)
    view.dom.addEventListener('mousemove', this.track)
    view.dom.addEventListener('mouseleave', this.hide)
  }

  update(update: ViewUpdate) {
    // The marks may have moved with the edit, and so may the line the strip is
    // parked on.
    if (update.docChanged || update.geometryChanged || update.viewportChanged) this.place()
  }

  destroy() {
    this.view.dom.removeEventListener('mousemove', this.track)
    this.view.dom.removeEventListener('mouseleave', this.hide)
    this.dom.remove()
  }

  private readonly track = (event: MouseEvent) => {
    const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    const line = this.view.state.doc.lineAt(position).number
    if (line === this.line) return
    this.line = line
    this.place()
  }

  private readonly hide = () => {
    this.line = undefined
    delete this.dom.dataset['shown']
  }

  private place() {
    const { line } = this
    if (line === undefined || line > this.view.state.doc.lines) return this.hide()
    const { from } = this.view.state.doc.line(line)
    const coords = this.view.coordsAtPos(from)
    // A line a notation hides has no box to sit beside.
    if (!coords) return this.hide()
    const top = coords.top - this.view.dom.getBoundingClientRect().top
    this.dom.style.setProperty('--rail-top', `${Math.round(top)}px`)
    const carried = new Set(Notations.at(this.view.state, line).map((notation) => notation.kind))
    for (const [kind, button] of this.buttons)
      if (carried.has(kind)) button.dataset['active'] = ''
      else delete button.dataset['active']
    this.dom.dataset['shown'] = ''
  }

  private toggle(kind: Notations.Kind) {
    const { line } = this
    if (line === undefined) return
    const { state } = this.view
    this.view.dispatch({
      changes: Notations.toggle(state, { kind, line, syntax: this.syntax }),
      // The strip keeps its place, so the caret stays where the writer left it
      // rather than jumping to the mark they set.
      selection: state.selection,
    })
  }
}
