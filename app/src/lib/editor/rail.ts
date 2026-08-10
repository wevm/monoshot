import type { Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

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
 * Offers every line the marks it can carry, so they can be set by pointer rather
 * than by typing the comment. The control for a mark the line already carries
 * turns it back off, which is how a hidden notation is taken away.
 *
 * One strip per line, shown by hovering the line itself rather than by following
 * the pointer: a pointer the page never sees move would otherwise leave the
 * controls unreachable. Only the lines on screen are built.
 */
export function rail(syntax: Notations.Syntax): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = build(view, syntax)
      }

      update(update: ViewUpdate) {
        // The marks are read from the document, so an edit can change which
        // controls a line shows as set.
        if (update.docChanged || update.viewportChanged)
          this.decorations = build(update.view, syntax)
      }
    },
    { decorations: (value) => value.decorations },
  )
}

function build(view: EditorView, syntax: Notations.Syntax): DecorationSet {
  const ranges = []
  for (const { from, to } of view.visibleRanges) {
    let position = from
    while (position <= to) {
      const line = view.state.doc.lineAt(position)
      const carried = Notations.at(view.state, line.number).map((notation) => notation.kind)
      // At the line's start, not its end: a concealed notation reaches that end,
      // and a widget inside the range standing in for it is never drawn. Where
      // the strip sits in the line says nothing about where it is drawn.
      ranges.push(
        Decoration.widget({ side: -1, widget: new Controls(syntax, carried) }).range(line.from),
      )
      position = line.to + 1
    }
  }
  return Decoration.set(ranges, true)
}

class Controls extends WidgetType {
  /** The marks the line carries, as one value a rebuild can be skipped on. */
  private readonly carried: string

  constructor(
    readonly syntax: Notations.Syntax,
    carried: readonly Notations.Kind[],
  ) {
    super()
    this.carried = [...carried].sort().join(' ')
  }

  override eq(other: Controls) {
    return other.carried === this.carried && other.syntax === this.syntax
  }

  override toDOM(view: EditorView) {
    const root = document.createElement('span')
    root.className = 'cm-rail'
    for (const kind of order) {
      const button = document.createElement('button')
      button.className = 'cm-rail-control'
      button.dataset['kind'] = kind
      button.type = 'button'
      button.title = labels[kind]
      button.setAttribute('aria-label', labels[kind])
      if (this.carried.split(' ').includes(kind)) button.dataset['active'] = ''
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[kind]}"/></svg>`
      // Ahead of the click: the editor would otherwise take focus and drop the
      // caret on whatever the control sits over.
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => this.toggle(view, root, kind))
      root.appendChild(button)
    }
    return root
  }

  /**
   * The line is read from where the strip sits rather than held, so an edit
   * above it cannot leave a control addressing the wrong line.
   */
  private toggle(view: EditorView, root: HTMLElement, kind: Notations.Kind) {
    const { state } = view
    const line = state.doc.lineAt(view.posAtDOM(root)).number
    view.dispatch({
      changes: Notations.toggle(state, { kind, line, syntax: this.syntax }),
      // The caret stays where the writer left it rather than jumping to the
      // mark they set.
      selection: state.selection,
    })
  }
}
