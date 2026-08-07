import type { Token } from './highlight.js'

/** A type, tokenized so it can be painted in the same colors as the code. */
export type Annotation = readonly (readonly Token[])[]

/** The pin control a surface carries, when it offers one. */
export type Action = {
  /** Accessible name, which also says which way the toggle goes. */
  label: string
  select: () => void
}

// Lucide's pin, at the size the annotation type is set in.
const pin =
  'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'

/**
 * Builds the surface a type is shown on. One shape for both the hover and the
 * pinned block, so pinning changes where a type sits rather than how it looks.
 */
export function element(annotation: Annotation, action?: Action): HTMLElement {
  const root = document.createElement('div')
  root.className = 'twoslash'
  if (action) root.appendChild(control(action))
  paint(root, annotation)
  return root
}

/**
 * Repaints a surface in place. Recreating it would replay its entrance, so a
 * type that only changed color arrives without announcing itself again.
 */
export function paint(root: HTMLElement, annotation: Annotation): void {
  const existing = root.querySelector('.twoslash-pin')
  root.replaceChildren()
  if (existing) root.appendChild(existing)
  for (const [index, line] of annotation.entries()) {
    if (index) root.appendChild(document.createTextNode('\n'))
    for (const token of line) {
      const span = document.createElement('span')
      span.textContent = token.content
      if (token.color) span.style.color = token.color
      const style = token.fontStyle ?? 0
      if (style & 1) span.style.fontStyle = 'italic'
      if (style & 2) span.style.fontWeight = 'bold'
      const decoration = [style & 4 && 'underline', style & 8 && 'line-through'].filter(Boolean)
      if (decoration.length) span.style.textDecoration = decoration.join(' ')
      root.appendChild(span)
    }
  }
}

function control(action: Action): HTMLElement {
  const button = document.createElement('button')
  button.className = 'twoslash-pin'
  button.type = 'button'
  button.ariaLabel = action.label
  button.title = action.label
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${pin}"/></svg>`
  // Pointer down rather than click: the editor would otherwise take the focus
  // back and dismiss the hover before the click landed. Plain primary presses
  // only, so a context menu or a modified click stays non-mutating.
  button.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return
    event.preventDefault()
    event.stopPropagation()
    action.select()
  })
  return button
}
