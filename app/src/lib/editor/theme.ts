import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { Theme } from 'monoshot'

import { motion } from '../../theme/tokens.stylex.js'

/** Depth under the completion menu, which floats above the code. */
const shadow = { dark: 'rgb(0 0 0 / 0.6)', light: 'rgb(0 0 0 / 0.18)' } as const

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
      // The window's inset lives here rather than outside the scroller, so a
      // pinned type's pin has room to paint left of column 0. Set in the
      // editor's own theme because CodeMirror injects it unlayered, which
      // beats anything the stylesheet says.
      '.cm-content': {
        caretColor: palette.window.foreground,
        paddingBlock: 0,
        paddingInline: 'var(--editor-inset)',
      },
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
        // The editor reaches past the window's inset so a pin has room to
        // paint; the gutter takes the inset back, so its numbers sit where the
        // exported frame draws them rather than against the window's edge.
        marginLeft: 'var(--editor-inset)',
        opacity: 0.4,
      },
      // With a gutter the code is already inset by it, and the room a pin
      // needs is the gutter's own width.
      '&:has(.cm-gutters) .cm-content': { paddingLeft: 0 },
      '.cm-lineNumbers .cm-gutterElement': { minWidth: '2ch', paddingInline: '0 20px' },
      // A selection has to read against every bundled theme, so it tints the
      // theme's own border color rather than picking a color of its own.
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: palette.window.border,
      },
      // The completion menu takes the window's own surface: it opens over the
      // artwork, and the default styling is a light panel whatever the theme.
      // Elevated rather than flush, because it floats above the code.
      '.cm-tooltip.cm-tooltip-autocomplete': {
        backgroundColor: `color-mix(in oklab, ${palette.window.foreground} 7%, ${palette.window.background})`,
        border: 'none',
        borderRadius: '10px',
        boxShadow: `inset 0 0 0 1px ${palette.window.border}, 0 12px 32px -8px ${shadow[palette.type]}`,
        fontFamily: 'var(--code-font-family)',
        fontSize: 'var(--code-annotation-size)',
        // Capped so a long name cannot push the menu past the window it opens
        // over.
        maxWidth: 'min(32ch, 80vw)',
        overflow: 'hidden',
        padding: '4px',
      },
      '.cm-tooltip-autocomplete > ul': { maxHeight: '15em', maxWidth: '100%' },
      '.cm-tooltip-autocomplete > ul > li': {
        alignItems: 'baseline',
        borderRadius: '6px',
        color: palette.window.foreground,
        display: 'flex',
        gap: '8px',
        lineHeight: 1.7,
        paddingInline: '8px',
      },
      // A row is a control, and a control acknowledges the press it takes.
      '.cm-tooltip-autocomplete > ul > li:active': {
        transform: 'scale(0.97)',
        transitionDuration: motion.fast,
        transitionProperty: 'transform',
        transitionTimingFunction: motion.out,
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: `color-mix(in oklab, ${palette.backdrop.from} 45%, transparent)`,
        color: palette.window.foreground,
      },
      // The matched characters carry the emphasis, so an unmatched label can
      // recede rather than every entry shouting equally.
      '.cm-completionMatchedText': { opacity: 1, textDecoration: 'none' },
      // The matched characters stay at full strength against a dimmed label,
      // which is what shows why an entry is in the list.
      '.cm-completionLabel': { opacity: 0.7 },
      'li[aria-selected] .cm-completionLabel': { opacity: 1 },
      // Names only: a glyph is a guess at this size and a hue reads as syntax
      // coloring that means something else.
      '.cm-completionIcon': { display: 'none' },
    },
    { dark: palette.type === 'dark' },
  )
}
