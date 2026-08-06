import { useSyncExternalStore } from 'react'

/** Color scheme override. `system` defers to the OS preference. */
export type Scheme = 'system' | 'light' | 'dark'

/** Where the override lives. Read by the pre-paint script in the root route. */
export const storageKey = 'monoshot.scheme'
const listeners = new Set<() => void>()

let scheme: Scheme = 'system'

function read(): string | null {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

function parse(value: string | null): Scheme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * Adopts the scheme the pre-paint script already applied, so the store agrees
 * with the document. Safe to call from any route.
 */
export function hydrate() {
  scheme = parse(read())
  for (const listener of listeners) listener()
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
  try {
    localStorage.setItem(storageKey, next)
  } catch {
    // Private browsing and blocked storage: the scheme still applies for this
    // session, it just does not persist.
  }
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
