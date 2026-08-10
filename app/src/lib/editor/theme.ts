import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { Theme } from 'monoshot'

import { color, motion } from '../../theme/tokens.stylex.js'

/** A row's bar and wash, from one hue. */
function mark(color: string) {
  return {
    backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
    boxShadow: `inset 3px 0 0 ${color}`,
  }
}

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
      // Every line reaches past the inset the code is held at, so a marked one
      // reads as a row of the window the way the exported image draws it. All of
      // them and not only the marked ones: the box a line's controls are placed
      // against would otherwise move the moment it took a mark.
      '.cm-line': {
        marginInline: 'calc(-1 * var(--editor-inset))',
        padding: 0,
        paddingInline: 'var(--editor-inset)',
        position: 'relative',
      },
      '.cm-gutterElement[class*="cm-mark-"]': {
        marginInline: 'calc(-1 * var(--editor-inset))',
        paddingInline: 'var(--editor-inset)',
      },
      // With a gutter the row starts there, so the bar belongs to it rather
      // than being drawn twice.
      '&:has(.cm-gutters) .cm-line[class*="cm-mark-"]': { boxShadow: 'none' },
      '.cm-lineNumbers .cm-gutterElement[class*="cm-mark-"]': {
        marginRight: 0,
        paddingInline: 'var(--editor-inset) 20px',
      },
      '.cm-gutterElement.cm-mark-add': { ...mark(Theme.marks.add), position: 'relative' },
      '.cm-gutterElement.cm-mark-blur': { opacity: 0.4 },
      '.cm-gutterElement.cm-mark-highlight': mark(palette.window.foreground),
      '.cm-gutterElement.cm-mark-remove': {
        ...mark(Theme.marks.remove),
        opacity: 0.7,
        position: 'relative',
      },
      '.cm-line.cm-mark-add': mark(Theme.marks.add),
      // The sign a diff line carries, in the inset the window already holds.
      // Its own pseudo-element, since the gutter draws a number in the other.
      '.cm-line.cm-mark-add::after, .cm-line.cm-mark-remove::after': {
        left: '6px',
        position: 'absolute',
      },
      '.cm-line.cm-mark-add::after': { color: Theme.marks.add, content: '"+"' },
      '.cm-line.cm-mark-remove::after': { color: Theme.marks.remove, content: '"-"' },
      // With a gutter the row starts there, so the sign goes with it rather
      // than landing on a number.
      '&:has(.cm-gutters) .cm-line.cm-mark-add::after': { content: '""' },
      '&:has(.cm-gutters) .cm-line.cm-mark-remove::after': { content: '""' },
      '.cm-gutterElement.cm-mark-add::after, .cm-gutterElement.cm-mark-remove::after': {
        left: '6px',
        position: 'absolute',
      },
      '.cm-gutterElement.cm-mark-add::after': { color: Theme.marks.add, content: '"+"' },
      '.cm-gutterElement.cm-mark-remove::after': {
        color: Theme.marks.remove,
        content: '"-"',
      },
      // A tag is prose the snippet carries, so it reads in the hue it was
      // tagged with rather than in the code's own colors.
      '.cm-line.cm-tag-annotate': { ...mark(Theme.marks.add), color: Theme.marks.add },
      '.cm-line.cm-tag-error': { ...mark(Theme.marks.remove), color: Theme.marks.remove },
      '.cm-line.cm-tag-log': { ...mark(Theme.marks.log), color: Theme.marks.log },
      '.cm-line.cm-tag-warn': { ...mark(Theme.marks.warn), color: Theme.marks.warn },
      // The code's own colors are painted on the spans inside, which the line
      // cannot talk over without saying so.
      '.cm-line[class*="cm-tag-"] span': { color: 'inherit !important' },
      // Focus says which lines matter, so the rest recede.
      '.cm-line.cm-mark-blur': { opacity: 0.4 },
      '.cm-line.cm-mark-highlight': mark(palette.window.foreground),
      '.cm-line.cm-mark-remove': mark(Theme.marks.remove),
      // The code being replaced reads as code that is gone: its own colors would
      // still be claiming it. Drained rather than recolored, so what the syntax
      // made of the line survives as light and dark.
      '.cm-line.cm-mark-remove span': { filter: 'grayscale(1)', opacity: 0.8 },
      '.cm-scroller': {
        fontFamily: 'var(--code-font-family)',
        // Every line reaches past the inset on both sides, which the scroller
        // would otherwise offer to scroll to. Lines wrap, so there is nothing
        // out there to reach.
        overflowX: 'hidden',
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
      // Underline only: the default lint styling paints a background that
      // fights whatever the theme colors the token underneath.
      '.cm-lintRange': { paddingBottom: '2px' },
      // Only the error class trades CodeMirror's painted squiggle for an
      // underline. A warning, a suggestion, and a message keep the default,
      // which is the marker they would otherwise lose.
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: `underline wavy ${palette.type === 'dark' ? color.squiggleOnDark : color.squiggleOnLight}`,
      },
      // The same surface a type gets: a message merges into the type's own
      // hover tooltip, and the two read as one popover or as neither. Matched
      // here rather than in the stylesheet, which the export shares and which
      // must never carry editor-only chrome.
      '.cm-tooltip-lint': {
        backgroundColor: `color-mix(in oklab, ${palette.window.foreground} 7%, ${palette.window.background})`,
        boxShadow: `inset 0 0 0 1px ${palette.window.border}`,
        color: palette.window.foreground,
        fontFamily: 'var(--code-font-family)',
        fontSize: 'var(--code-annotation-size)',
        lineHeight: 1.5,
        listStyle: 'none',
        margin: 0,
        maxWidth: '64ch',
        padding: 0,
      },
      '.cm-diagnostic': { borderLeft: 'none', padding: '6px 10px' },
    },
    { dark: palette.type === 'dark' },
  )
}
