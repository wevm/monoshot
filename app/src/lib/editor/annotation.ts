import { Tooltip } from '#/ui/Tooltip.js'
import type { Token } from './highlight.js'

/** A type, tokenized so it can be painted in the same colors as the code. */
export type Annotation = readonly (readonly Token[])[]

/** The pin control a surface carries, when it offers one. */
export type Action = {
  /** The glyph it is drawn as. The pin, for whatever pins or unpins. */
  icon?: string | undefined
  /** Accessible name, which also says which way the toggle goes. */
  label: string
  select: () => void
}

/** Lucide's x, for whatever a surface offers to be rid of. */
export const cross = 'M18 6 6 18M6 6l12 12'

/** Lucide's rotate-ccw, for whatever a surface offers to have back. */
export const back = 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5'

/**
 * Lucide's pin, at the size the annotation type is set in. Shared, so whatever
 * offers to unpin something offers the same glyph.
 */
export const pin =
  'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'

/**
 * Builds the surface a type is shown on. One shape for both the hover and the
 * pinned block, so pinning changes where a type sits rather than how it looks.
 */
export function element(annotation: Annotation, actions?: Action | readonly Action[]): HTMLElement {
  const root = document.createElement('div')
  root.className = 'twoslash'
  const offered =
    actions === undefined ? [] : Array.isArray(actions) ? actions : [actions as Action]
  if (offered.length) {
    const controls = document.createElement('div')
    controls.className = 'twoslash-controls'
    for (const action of offered) controls.appendChild(control(action))
    root.appendChild(controls)
  }
  paint(root, annotation)
  return root
}

/**
 * Repaints a surface in place. Recreating it would replay its entrance, so a
 * type that only changed color arrives without announcing itself again.
 */
export function paint(root: HTMLElement, annotation: Annotation): void {
  const body = root.querySelector('.twoslash-body') ?? create(root)
  body.replaceChildren()
  for (const [index, line] of annotation.entries()) {
    if (index) body.appendChild(document.createTextNode('\n'))
    for (const token of line) {
      const span = document.createElement('span')
      span.textContent = token.content
      if (token.color) span.style.color = token.color
      const style = token.fontStyle ?? 0
      if (style & 1) span.style.fontStyle = 'italic'
      if (style & 2) span.style.fontWeight = 'bold'
      const decoration = [style & 4 && 'underline', style & 8 && 'line-through'].filter(Boolean)
      if (decoration.length) span.style.textDecoration = decoration.join(' ')
      body.appendChild(span)
    }
  }
}

/**
 * The box holding the type's own text.
 *
 * Separate from the surface so a tall type can scroll without taking the pin
 * with it: the pin hangs off the surface's edge, and anything that scrolls
 * clips what sits outside it.
 */
function create(root: HTMLElement) {
  const body = document.createElement('div')
  body.className = 'twoslash-body'
  root.appendChild(body)
  return body
}

function control(action: Action): HTMLElement {
  const button = document.createElement('button')
  button.className = 'twoslash-pin'
  button.type = 'button'
  button.ariaLabel = action.label
  // The hint every other control in the app draws, asked for by hand: a button
  // written rather than rendered has nothing for a trigger to wrap.
  button.addEventListener('pointerenter', () => Tooltip.point({ at: button, label: action.label }))
  button.addEventListener('pointerleave', () => Tooltip.point())
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${action.icon ?? pin}"/></svg>`
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
