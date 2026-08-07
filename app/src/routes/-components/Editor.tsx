import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers as gutter } from '@codemirror/view'
import * as stylex from '@stylexjs/stylex'
import type { Theme } from 'monoshot'
import { useEffect, useRef } from 'react'

import { highlight, setTokens } from '#/lib/editor/highlight.js'
import type { Token } from '#/lib/editor/highlight.js'
import { hover } from '#/lib/editor/hover.js'
import type { Types } from '#/lib/editor/hover.js'
import { number, query as queries, setQuery } from '#/lib/editor/query.js'
import { theme } from '#/lib/editor/theme.js'

const styles = stylex.create({
  root: {
    // Metrics live in the shared `--code-*` properties; only the box is here.
    paddingBlock: 12,
  },
})

/** The editable code surface. Colored from shiki tokens, not a CM6 grammar. */
export function Editor(props: Editor.Props) {
  const { code, lineNumbers, onCodeChange, palette, tokens, types } = props

  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  // Held in a ref so changing the handler never rebuilds the editor.
  const onChange = useRef(onCodeChange)
  onChange.current = onCodeChange
  const palettes = useRef(new Compartment()).current
  const gutters = useRef(new Compartment()).current
  const hovers = useRef(new Compartment()).current

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const instance = new EditorView({
      parent,
      state: EditorState.create({
        doc: code,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          // Without a name the code surface reads as an unlabelled edit field.
          EditorView.contentAttributes.of({ 'aria-label': 'Code' }),
          highlight,
          queries,
          hovers.of(hover(types)),
          gutters.of(lineNumbers ? gutter({ formatNumber: number }) : []),
          palettes.of(theme(palette)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = instance
    return () => {
      view.current = null
      instance.destroy()
    }
    // Built once: the document and palette are pushed in below rather than
    // rebuilding the editor and losing the cursor on every keystroke.
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: palettes.reconfigure(theme(palette)) })
  }, [palette, palettes])

  useEffect(() => {
    view.current?.dispatch({
      effects: gutters.reconfigure(lineNumbers ? gutter({ formatNumber: number }) : []),
    })
  }, [gutters, lineNumbers])

  useEffect(() => {
    view.current?.dispatch({
      effects: [hovers.reconfigure(hover(types)), setQuery.of(types)],
    })
  }, [hovers, types])

  // A code change from outside, such as restoring a shared snippet.
  useEffect(() => {
    const instance = view.current
    if (!instance || instance.state.doc.toString() === code) return
    instance.dispatch({
      changes: { from: 0, insert: code, to: instance.state.doc.length },
    })
  }, [code])

  // After the document above, never before: tokens built against a restored
  // snippet would map through its own replacement and vanish.
  useEffect(() => {
    view.current?.dispatch({ effects: setTokens.of(tokens) })
  }, [tokens])

  return <div ref={host} {...stylex.props(styles.root)} />
}

export declare namespace Editor {
  /** Props for {@link Editor}. */
  type Props = {
    /** The document. Changing it from outside replaces the editor's content. */
    code: string
    /** Shows the line-number gutter. */
    lineNumbers: boolean
    /** Receives every edit. */
    onCodeChange: (code: string) => void
    /** Colors the editor to match the frame it sits in. */
    palette: Theme.derive.Result
    /** Types by identifier, shown on hover and under a pinned `^?` caret. */
    types: Types
    /** Shiki tokens for the current document, one array per line. */
    tokens: readonly (readonly Token[])[]
  }
}
