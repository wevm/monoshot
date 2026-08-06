import type { Token } from './highlight.js'

/** A type, tokenized so it can be painted in the same colors as the code. */
export type Annotation = readonly (readonly Token[])[]

/**
 * Builds the surface a type is shown on. One shape for both the hover and the
 * pinned block, so pinning changes where a type sits rather than how it looks.
 */
export function element(annotation: Annotation): HTMLElement {
  const root = document.createElement('div')
  root.className = 'twoslash'
  for (const [index, line] of annotation.entries()) {
    if (index) root.appendChild(document.createTextNode('\n'))
    for (const token of line) {
      const span = document.createElement('span')
      span.textContent = token.content
      if (token.color) span.style.color = token.color
      const style = token.fontStyle ?? 0
      if (style & 1) span.style.fontStyle = 'italic'
      if (style & 2) span.style.fontWeight = 'bold'
      root.appendChild(span)
    }
  }
  return root
}
