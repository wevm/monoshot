import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

import appCss from '#/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'monoshot' },
      { name: 'description', content: 'Beautiful code images with type-aware annotations.' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // StyleX dev CSS is served by the unplugin's dev middleware; the built
      // CSS is appended to the styles.css asset, so prod needs no extra link.
      ...(import.meta.env.DEV ? [{ rel: 'stylesheet', href: '/virtual:stylex.css' }] : []),
    ],
  }),
  component: Layout,
  shellComponent: Document,
})

function Layout() {
  return (
    <>
      <StylexDevReload />
      <Outlet />
    </>
  )
}

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

// Subscribes the dev stylesheet to the plugin's `stylex:css-update` events so
// edits hot-reload; the virtual module resolves only under `devMode: 'css-only'`.
function StylexDevReload() {
  useEffect(() => {
    if (import.meta.env.DEV) void import('virtual:stylex:css-only')
  }, [])
  return null
}
