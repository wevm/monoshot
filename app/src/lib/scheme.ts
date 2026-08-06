import { useSyncExternalStore } from 'react'

/** Color scheme override. `system` defers to the OS preference. */
export type Scheme = 'system' | 'light' | 'dark'

const storageKey = 'monoshot.scheme'
const listeners = new Set<() => void>()

let scheme: Scheme = 'system'

function parse(value: string | null): Scheme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** Reads the persisted scheme and applies it. Called once on client mount. */
export function hydrate() {
  set(parse(localStorage.getItem(storageKey)))
}

export function get(): Scheme {
  return scheme
}

/**
 * Applies the scheme by setting `color-scheme` on the document element, which
 * flips every `light-dark()` token at once. `system` clears the override.
 */
export function set(next: Scheme) {
  scheme = next
  localStorage.setItem(storageKey, next)
  document.documentElement.style.colorScheme = next === 'system' ? '' : next
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useScheme(): Scheme {
  return useSyncExternalStore(subscribe, get, () => 'system' as const)
}
