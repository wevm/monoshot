/**
 * Where this deployment answers, as an absolute origin.
 *
 * Absolute because a link preview is fetched by a crawler with no page to
 * resolve a relative path against. Set `VITE_SITE_URL` for a deployment that
 * answers somewhere else, such as a preview build or a custom domain.
 */
export const origin = (
  import.meta.env.VITE_SITE_URL ?? 'https://monoshot.broken-thunder-fb8b.workers.dev'
).replace(/\/$/, '')

/** An absolute URL for a path this deployment serves. */
export function url(path: string): string {
  return `${origin}${path}`
}
