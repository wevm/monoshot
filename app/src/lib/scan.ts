/**
 * Whether the page was asked for with `?scan`, read as this module loads: the
 * editor writes the snippet to the URL as soon as it mounts, and the search is
 * not part of what it writes.
 */
const asked = typeof location !== 'undefined' && new URLSearchParams(location.search).has('scan')

/**
 * The render overlay, for a page asked for with `?scan`: React Scan draws what
 * re-rendered and what each render cost, with a frame rate beside it.
 *
 * Asked for rather than always on, since the outlines it draws cost frames of
 * their own, and the frame rate is what it is being read for.
 */
export async function start() {
  if (!asked) return
  // Its own chunk: a page that did not ask for the overlay never fetches it.
  const { scan } = await import('react-scan')
  // Forced, since a built app calls itself production and the query is what
  // asks for it. Inset to clear the app's own toolbar along the bottom.
  scan({ dangerouslyForceRunInProduction: true, safeArea: { bottom: 76 } })
}
