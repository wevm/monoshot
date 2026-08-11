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

/** Why a row offers no marks, since its controls cannot say so themselves. */
const unmarkable = 'This row takes no mark'

/**
 * How far the controls stand off the window's edge: past the grip that resizes
 * it, which reaches 8px into the margin and is the more important thing to hit.
 */
const gap = 10

/** The gap a surface's controls keep from it, as the margin inside one does. */
const margin = 2

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
  return [reached, ViewPlugin.define((view) => build(view, container, syntax))]
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
function build(view: EditorView, container: HTMLElement, syntax: Notations.Syntax) {
  const strip = document.createElement('div')
  /** What covers each row on screen, by what that row is. */
  const reaches = new Map<string, HTMLElement>()
  /** What each row offers, read back when the strip moves onto it. */
  const rows = new Map<string, Row>()
  /** The controls a pinned surface hangs off its edge, by the surface they act on. */
  const hung = new Map<HTMLElement, HTMLElement>()
  /** The row the strip is built for, so it is rebuilt only when it moves. */
  let showing: string | undefined
  /** The mark a press is carrying down the rows, while it is held. */
  let painting: Painting | undefined
  /** Where the host sits, so a pointer over it can be read against the strip. */
  let host = 0
  /** Whether this has been replaced, which a measure already asked for outlives. */
  let gone = false

  // The host is this plugin's alone, so whatever is in it belongs to a
  // predecessor: reconfiguring the editor leaves one behind.
  container.replaceChildren()
  strip.className = 'rail'
  strip.style.setProperty('--rail-gap', `${gap}px`)
  container.appendChild(strip)
  view.dom.addEventListener('mousemove', track)
  view.dom.addEventListener('mouseover', track)
  view.dom.addEventListener('mouseleave', clear)
  container.addEventListener('mouseleave', clear)
  // Out here the strip is under the pointer rather than beside a row, so it
  // goes where the pointer goes rather than stepping between rows.
  container.addEventListener('mousemove', follow)
  // On the window: a press carrying a mark down the rows can be let go
  // anywhere, and the rows are not where the pointer has to be by then.
  window.addEventListener('mouseup', drop)
  render()

  return { destroy, update }

  function update(update: ViewUpdate) {
    const row = update.state.field(reached)
    if (update.docChanged || update.viewportChanged || update.geometryChanged) return render()
    if (row !== update.startState.field(reached)) show(row)
  }

  function destroy() {
    gone = true
    view.dom.removeEventListener('mousemove', track)
    view.dom.removeEventListener('mouseover', track)
    view.dom.removeEventListener('mouseleave', clear)
    container.removeEventListener('mouseleave', clear)
    container.removeEventListener('mousemove', follow)
    window.removeEventListener('mouseup', drop)
    window.removeEventListener('mousemove', carry)
    // Handed back before the layer is emptied: the surfaces outlive this, and a
    // successor takes them out again from where they were written.
    for (const [surface, controls] of hung) {
      delete controls.dataset['outside']
      delete controls.dataset['shown']
      surface.appendChild(controls)
    }
    hung.clear()
    container.replaceChildren()
    reaches.clear()
  }

  /** Where the pointer is out beside the code, which the strip sits at. */
  function follow(event: MouseEvent) {
    strip.dataset['following'] = ''
    const at = event.clientY - host
    strip.style.setProperty('--rail-top', `${Math.round(at)}px`)
    // Read from where the pointer is rather than from the cover under it: the
    // strip travels with the pointer, and out here it is over the covers it
    // passes, which then never notice it.
    reaching(rowAt(at))
  }

  /** The row at a height down the host, which is what the covers stand for. */
  function rowAt(at: number) {
    let found: string | undefined
    // The last of them, as the covers are stacked: a complaint drawn under a
    // line sits inside that line's own block.
    for (const [key, row] of rows) if (at >= row.top && at <= row.top + row.height) found = key
    return found
  }

  /**
   * Which row the pointer is over, read by what it is over rather than by
   * position: a complaint draws between two lines, and a position would name
   * one of them.
   */
  function track(event: MouseEvent) {
    // Back beside a row: over the code the strip belongs to the line it acts on
    // rather than to the pointer.
    if (strip.dataset['following'] !== undefined) {
      delete strip.dataset['following']
      show(view.state.field(reached, false))
    }
    const target = event.target instanceof Element ? event.target.closest('.cm-objection') : null
    if (target) return reaching(`pin:${lineOf(target)}`)
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    reaching(`line:${view.state.doc.lineAt(position).number}`)
  }

  function clear() {
    return reaching(undefined)
  }

  function drop() {
    painting = undefined
    window.removeEventListener('mousemove', carry)
  }

  /**
   * The row under a press being held, read from where the pointer is rather than
   * from what it is over: writing a notation moves the rows, and what covers
   * them says where they were when it was last measured.
   */
  function carry(event: MouseEvent) {
    if (!painting) return
    // Let go outside the window, the release never reached the page: the first
    // move back in with nothing held is where the press ended.
    if (!(event.buttons & 1)) return drop()
    const height = event.clientY - view.documentTop
    const block = view.lineBlockAtHeight(Math.min(Math.max(height, 0), view.contentHeight - 1))
    spread(view.state.doc.lineAt(block.from).number)
  }

  function reaching(key: string | undefined) {
    if (view.state.field(reached, false) === key) return
    view.dispatch({ effects: reach.of(key) })
  }

  /** The line a complaint drawn under it belongs to. */
  function lineOf(objection: Element) {
    return view.state.doc.lineAt(view.posAtDOM(objection)).number
  }

  /**
   * Measures the rows and covers each one. Measured through CodeMirror rather
   * than during an update, which would read a layout the update is still
   * writing.
   */
  function render() {
    if (gone) return
    view.requestMeasure({
      read: (view) => {
        const box = container.getBoundingClientRect()
        host = box.top
        const rows: Row[] = []
        const closed = new Set(Notations.removed(view.state))
        for (const { from, to } of view.visibleRanges) {
          let position = from
          while (position <= to) {
            const line = view.state.doc.lineAt(position)
            const block = view.lineBlockAt(line.from)
            position = line.to + 1
            // A row closed up because it holds a notation and nothing else is
            // not on screen to be reached for. Asked of the notations rather
            // than of the height: a measure taken while the editor is settling
            // reads every row as nothing, and would cover none of them.
            if (closed.has(line.number)) continue
            rows.push({
              carried: Notations.at(view.state, line.number).map((notation) => notation.kind),
              height: block.height,
              key: `line:${line.number}`,
              line: line.number,
              takes: Notations.takesMark(view.state, line.number),
              // The document's own top, so a scrolled row still lands beside
              // itself.
              top: view.documentTop + block.top - box.top,
            })
          }
        }
        // Read off the rows themselves: a complaint is drawn between two lines,
        // which the geometry of either one does not describe.
        for (const drawn of view.dom.querySelectorAll('.cm-objection')) {
          const line = lineOf(drawn)
          const at = keptUnder(view.state, line)
          if (at === undefined) continue
          const drawn2 = drawn.getBoundingClientRect()
          rows.push({ at, height: drawn2.height, key: `pin:${line}`, top: drawn2.top - box.top })
        }
        // Pinned surfaces are drawn in the code, which the window clips, so what
        // hangs off their edge is measured here and drawn out here with the rest.
        const surfaces = []
        for (const surface of view.dom.querySelectorAll<HTMLElement>(
          '.twoslash-block > .twoslash',
        )) {
          const shown = surface.getBoundingClientRect()
          surfaces.push({ left: shown.left - box.left, surface, top: shown.top - box.top })
        }
        return {
          left: view.dom.getBoundingClientRect().right - box.left + gap,
          rows,
          surfaces,
          width: box.width,
        }
      },
      write: (measured) => {
        // A measure asked for before this was replaced still runs, and what it
        // would build is something nothing owns.
        if (gone) return
        const stale = new Set(reaches.keys())
        rows.clear()
        for (const row of measured.rows) {
          stale.delete(row.key)
          rows.set(row.key, row)
          const covered = reaches.get(row.key) ?? cover(row.key)
          reaches.set(row.key, covered)
          covered.style.setProperty('--rail-left', `${Math.round(measured.left)}px`)
          covered.style.setProperty('--rail-top', `${Math.round(row.top)}px`)
          covered.style.setProperty('--rail-height', `${Math.round(row.height)}px`)
        }
        for (const key of stale) {
          reaches.get(key)?.remove()
          reaches.delete(key)
        }
        const dropped = new Set(hung.keys())
        for (const { left, surface, top } of measured.surfaces) {
          dropped.delete(surface)
          const controls = hung.get(surface) ?? hang(surface)
          if (!controls) continue
          // Held by its right edge: what it is beside is what it acts on, and its
          // own width is whatever the surface offered.
          controls.style.setProperty(
            '--rail-right',
            `${Math.round(measured.width - left + margin)}px`,
          )
          controls.style.setProperty('--rail-top', `${Math.round(top)}px`)
        }
        for (const surface of dropped) {
          hung.get(surface)?.remove()
          hung.delete(surface)
        }
        strip.style.setProperty('--rail-left', `${Math.round(measured.left)}px`)
        // Rebuilt where it stands: what a row offers can change under it.
        showing = undefined
        show(view.state.field(reached, false))
      },
    })
  }

  /** Moves the strip onto the row being reached for, and builds what it offers. */
  function show(key: string | undefined) {
    const row = key === undefined ? undefined : rows.get(key)
    if (!row) {
      delete strip.dataset['shown']
      showing = undefined
      return
    }
    // Centred on the row rather than hung from its top: the strip is its own
    // padding taller than the control inside it. Not while it is following a
    // pointer, which is where it sits then.
    if (strip.dataset['following'] === undefined)
      strip.style.setProperty('--rail-top', `${Math.round(row.top + row.height / 2)}px`)
    strip.dataset['shown'] = ''
    if (showing === key) return
    showing = key
    strip.replaceChildren(...controls(row))
  }

  /**
   * Takes a pinned surface's controls out of the code and draws them beside it
   * out here, where the window's edge is not there to cut them off. Reaching for
   * them is the surface's own business either way, so the surface says when.
   */
  function hang(surface: HTMLElement) {
    const controls = surface.querySelector('.twoslash-controls')
    if (!(controls instanceof HTMLElement)) return undefined
    controls.dataset['outside'] = ''
    container.appendChild(controls)
    hung.set(surface, controls)
    const show = () => {
      controls.dataset['shown'] = ''
    }
    const hide = () => {
      delete controls.dataset['shown']
    }
    // Once: a surface outliving the rail that took its controls out is hung
    // again by the next one, and the listeners it was given still stand.
    if (controls.dataset['wired'] === undefined) {
      controls.dataset['wired'] = ''
      for (const element of [surface, controls]) {
        element.addEventListener('mouseenter', show)
        element.addEventListener('mouseleave', hide)
      }
    }
    return controls
  }

  /** A transparent cover over a row, which is what notices the pointer on it. */
  function cover(key: string) {
    const cover = document.createElement('div')
    cover.className = 'rail-reach'
    cover.style.setProperty('--rail-gap', `${gap}px`)
    cover.addEventListener('mouseenter', () => reaching(key))
    container.appendChild(cover)
    return cover
  }

  /** What a row offers: the marks it can carry, or the one way out of it. */
  function controls(row: Row) {
    const { at, line } = row
    if (line === undefined)
      return at === undefined
        ? []
        : [
            control({
              // Set, since the complaint being on screen is what this row is.
              active: true,
              // The glyph that pinned it, in the hue the complaint carries: the
              // one thing this offers is to take it back.
              color: Theme.marks.remove,
              icon: Annotation.pin,
              label: 'Unpin this message',
              select: () => keep(view, at),
            }),
          ]
    return order.map((kind) => {
      const button = control({
        active: row.takes === true && row.carried?.includes(kind) === true,
        hold: () => {
          // What the press decides for the row it started on is what it carries
          // to every row it reaches, rather than flipping each in turn.
          painting = {
            changed: new Set(),
            kind,
            origin: view.state.doc.line(line).from,
            set: row.carried?.includes(kind) !== true,
          }
          window.addEventListener('mousemove', carry)
          spread(line)
        },
        icon: icons[kind],
        label: row.takes === true ? labels[kind] : unmarkable,
        select: () => toggle(line, kind),
      })
      button.dataset['kind'] = kind
      button.disabled = row.takes !== true
      return button
    })
  }

  /** One control of the strip, whichever the strip is. */
  function control(options: {
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
    // What `data-active` draws, said out loud: without it every control reads as
    // the same button whether pressing it writes a mark or takes one away.
    button.setAttribute('aria-pressed', String(options.active === true))
    if (options.color) button.style.setProperty('--rail-color', options.color)
    button.type = 'button'
    button.title = options.label
    button.setAttribute('aria-label', options.label)
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${options.icon}"/></svg>`
    // Ahead of the click: the editor would otherwise take focus and drop the
    // caret on whatever the control sits over.
    button.addEventListener('mousedown', (event) => {
      // A right or middle press opens a menu or pastes; a modified one is the
      // platform's. Only a plain left press writes to the snippet.
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return
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
  function spread(line: number) {
    if (!painting) return
    const { doc } = view.state
    const origin = doc.lineAt(painting.origin).number
    const from = Math.min(origin, line)
    const to = Math.max(origin, line)
    for (const at of [...painting.changed]) {
      const number = doc.lineAt(at).number
      if (number >= from && number <= to) continue
      painting.changed.delete(at)
      apply(number, painting.kind, !painting.set)
    }
    let number = from
    let last = to
    while (number <= last) {
      if (!painting.changed.has(view.state.doc.line(number).from)) {
        // Where the row ended up rather than where it was: setting focus writes
        // a line above it, and a row remembered by where it was reads as
        // untouched the next time the press passes over it.
        const landed = apply(number, painting.kind, painting.set)
        if (landed !== undefined) {
          painting.changed.add(landed)
          // The row and everything under it moved down by what was written
          // above it, so the rows still to reach are further along by as much.
          const moved = view.state.doc.lineAt(landed).number - number
          number += moved
          last += moved
        }
      }
      number += 1
    }
  }

  /**
   * Sets or clears a mark on a row, leaving one already that way alone. Says
   * where the row ended up, since only what changed is put back and the row can
   * have moved to make space for the notation.
   */
  function apply(line: number, kind: Notations.Kind, set: boolean) {
    const { state } = view
    if (line > state.doc.lines || !Notations.takesMark(state, line)) return undefined
    const carries = Notations.at(state, line).some((notation) => notation.kind === kind)
    if (carries === set) return undefined
    const at = state.doc.line(line).from
    const transaction = toggle(line, kind)
    // Toward the row rather than the line written above it: an insertion at its
    // start belongs to what was inserted, not to what it pushed down.
    return transaction ? transaction.changes.mapPos(at, 1) : at
  }

  function toggle(line: number, kind: Notations.Kind) {
    const { state } = view
    // Refused here rather than only on the control: a blank line carrying a mark
    // of its own would be taken away along with it.
    if (line > state.doc.lines || !Notations.takesMark(state, line)) return undefined
    const transaction = state.update({
      changes: Notations.toggle(state, { kind, line, syntax }),
      // No selection of its own: the caret stays where the writer left it, and
      // one supplied here would be read against the changed document, landing
      // it wherever the offsets happened to point after the mark was written.
    })
    view.dispatch(transaction)
    // Setting focus writes a line, so what a press is holding onto moves: the
    // rows it covers are the same rows at their new offsets.
    if (!painting) return transaction
    painting.origin = transaction.changes.mapPos(painting.origin, 1)
    const changed = [...painting.changed].map((at) => transaction.changes.mapPos(at, 1))
    painting.changed.clear()
    for (const at of changed) painting.changed.add(at)
    return transaction
  }
}
