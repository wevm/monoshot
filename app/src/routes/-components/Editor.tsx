import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers as gutter } from '@codemirror/view'
import * as stylex from '@stylexjs/stylex'
import type { Theme } from 'monoshot'
import type * as Twoslash from 'monoshot/twoslash'
import { useContext, useEffect, useRef } from 'react'

import { completions } from '#/lib/editor/completions.js'
import { highlight, setTokens } from '#/lib/editor/highlight.js'
import type { Token } from '#/lib/editor/highlight.js'
import { hover } from '#/lib/editor/hover.js'
import { indent } from '#/lib/editor/indent.js'
import { notations, syntax } from '#/lib/editor/notations.js'
import { rail } from '#/lib/editor/rail.js'
import { pins, problems } from '#/lib/editor/problems.js'
import { number, query as queries } from '#/lib/editor/query.js'
import { theme } from '#/lib/editor/theme.js'
import { setTypes } from '#/lib/editor/types.js'
import type { Completion } from '#/lib/twoslash/protocol.js'
import type { Types } from '#/lib/editor/types.js'

import { Frame } from './Frame.js'

const styles = stylex.create({
  root: {
    // Metrics live in the shared `--code-*` properties; only the box is here.
    paddingBlock: 12,
  },
})

/** The editable code surface. Colored from shiki tokens, not a CM6 grammar. */
export function Editor(props: Editor.Props) {
  const {
    code,
    diagnostics,
    language,
    lineNumbers,
    onCodeChange,
    onComplete,
    palette,
    tokens,
    types,
  } = props

  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  // Held in a ref so changing the handler never rebuilds the editor.
  const onChange = useRef(onCodeChange)
  onChange.current = onCodeChange
  const ask = useRef(onComplete)
  ask.current = onComplete
  const palettes = useRef(new Compartment()).current
  const gutters = useRef(new Compartment()).current
  const rails = useRef(new Compartment()).current
  // Where the controls beside a line are drawn: outside the window, which clips.
  const aside = useContext(Frame.Aside)

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const instance = new EditorView({
      parent,
      state: EditorState.create({
        doc: code,
        extensions: [
          history(),
          indent,
          // The generic bracket set leaves out the backtick, so a template
          // literal would open without closing. Supplied as language data
          // because the editor has no grammar to carry it.
          EditorState.languageData.of(() => [
            { closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`'] } },
          ]),
          closeBrackets(),
          // Ahead of the defaults: backspacing between a freshly typed pair
          // takes both, which the plain delete binding would not.
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          // Without a name the code surface reads as an unlabelled edit field.
          EditorView.contentAttributes.of({ 'aria-label': 'Code' }),
          highlight,
          notations,
          pins,
          // The complaints are pushed in rather than found here, so there is no
          // source to run. Only the configuration is wanted: the built-in
          // tooltip waits 300ms and would repeat what the hover already draws
          // the moment the pointer lands.
          linter(null, { tooltipFilter: () => [] }),
          rails.of(rail({ container: aside, syntax: syntax(language) })),
          queries,
          hover,
          completions((document, position) => ask.current(document, position)),
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
      effects: rails.reconfigure(rail({ container: aside, syntax: syntax(language) })),
    })
  }, [aside, language, rails])

  useEffect(() => {
    view.current?.dispatch({ effects: setTypes.of(types) })
  }, [types])

  // After the document below would be wrong: a diagnostic clamped against the
  // previous text would land on the wrong words for a frame.
  useEffect(() => {
    const instance = view.current
    if (instance) instance.dispatch(problems(instance.state, diagnostics))
  }, [diagnostics])

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
    /** What the compiler objected to, drawn as squiggles. */
    diagnostics: readonly Twoslash.Diagnostic[]
    /** What the snippet is written in, which decides how a mark is written. */
    language: string
    /** Shows the line-number gutter. */
    lineNumbers: boolean
    /** Receives every edit. */
    onCodeChange: (code: string) => void
    /** Asked what could go at the caret, whenever the menu wants entries. */
    onComplete: (code: string, position: number) => Promise<readonly Completion[]>
    /** Colors the editor to match the frame it sits in. */
    palette: Theme.derive.Result
    /** Types by identifier, shown on hover and under a pinned `^?` caret. */
    types: Types
    /** Shiki tokens for the current document, one array per line. */
    tokens: readonly (readonly Token[])[]
  }
}
