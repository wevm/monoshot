import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { Theme } from 'monoshot'

/**
 * Dresses the editor as the window it sits in: the frame already paints the
 * background, so the editor contributes text, caret, and selection only.
 *
 * Metrics come from the shared `--code-*` properties rather than values of its
 * own, so the editor and the rendered frame lay out identically.
 */
export function theme(palette: Theme.derive.Result): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: palette.window.foreground,
        fontFamily: 'var(--code-font-family)',
        fontSize: 'var(--code-font-size)',
        fontVariantLigatures: 'none',
      },
      '&.cm-focused': { outline: 'none' },
      // The frame owns the padding around the code, so the editor adds none.
      '.cm-content': { caretColor: palette.window.foreground, padding: 0 },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette.window.foreground },
      '.cm-line': { padding: 0 },
      '.cm-scroller': {
        fontFamily: 'var(--code-font-family)',
        lineHeight: 'var(--code-line-height)',
        tabSize: 'var(--code-tab-size)',
      },
      // The annotation draws its own surface, so CodeMirror's tooltip chrome
      // has to step aside. It belongs here rather than in the stylesheet:
      // CodeMirror injects its styles unlayered, and unlayered always wins.
      '.cm-tooltip': { backgroundColor: 'transparent', border: 'none' },
      // The gutter is part of the artwork, so it recedes rather than sitting
      // on a panel of its own.
      '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: 'none',
        color: palette.window.foreground,
        opacity: 0.4,
      },
      '.cm-lineNumbers .cm-gutterElement': { minWidth: '2ch', paddingInline: '0 20px' },
      // A selection has to read against every bundled theme, so it tints the
      // theme's own border color rather than picking a color of its own.
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: palette.window.border,
      },
    },
    { dark: palette.type === 'dark' },
  )
}
