/** Session marker set after the first visual load completes. */
export const storageKey = 'monoshot.opened'

/** Remembers that this tab has already loaded the opening assets. */
export function remember(): void {
  try {
    sessionStorage.setItem(storageKey, 'true')
  } catch {}
}
