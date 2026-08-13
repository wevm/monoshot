/**
 * Absolute origin for this deployment.
 *
 * Set `VITE_SITE_URL` for preview deployments or custom domains.
 */
export const origin = (
  import.meta.env.VITE_SITE_URL ?? 'https://monoshot.broken-thunder-fb8b.workers.dev'
).replace(/\/$/, '')

/** An absolute URL for a path this deployment serves. */
export function url(path: string): string {
  return `${origin}${path}`
}
