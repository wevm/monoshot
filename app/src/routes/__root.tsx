import * as stylex from '@stylexjs/stylex'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

import * as Scheme from '#/lib/scheme.js'
import * as Site from '#/lib/site.js'
import appCss from '#/styles.css?url'
import { Tooltip } from '#/ui/Tooltip.js'
import { motion } from '../theme/tokens.stylex.js'

const title = 'monoshot'
const description = 'Render code images with type-aware annotations.'
/** Drawn by `gen:og`, which records what it rendered at. */
const card = { height: '651', path: '/og.png', width: '1200' } as const

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      { name: 'description', content: description },
      // The preview is a frame this renderer drew, which is the product
      // showing its own output. Absolute URLs throughout: a crawler has no
      // page to resolve a relative one against.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: title },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: Site.origin },
      { property: 'og:image', content: Site.url(card.path) },
      { property: 'og:image:width', content: card.width },
      { property: 'og:image:height', content: card.height },
      {
        property: 'og:image:alt',
        content: 'A code frame with a resolved type drawn under a query',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: Site.url(card.path) },
    ],
    scripts: [{ children: schemeScript }],
    links: [
      { rel: 'canonical', href: Site.origin },
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
  // Apply the stored color scheme to every route.
  useEffect(() => Scheme.hydrate(), [])
  return (
    <Tooltip.Provider>
      <StylexDevReload />
      <Outlet />
      <Tooltip.Surface />
    </Tooltip.Provider>
  )
}

// Runs before first paint so a stored override never flashes the OS scheme.
// Inlined rather than imported because module scripts are deferred.
const schemeScript = `try{var s=localStorage.getItem(${JSON.stringify(Scheme.storageKey)});if(s==='light'||s==='dark')document.documentElement.style.colorScheme=s}catch{}`

function Document({ children }: { children: ReactNode }) {
  return (
    // The pre-paint script sets `color-scheme` before React hydrates, which
    // React would otherwise report as a mismatched attribute.
    <html lang="en" suppressHydrationWarning {...stylex.props(styles.root)}>
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

// Republishes the motion consts as custom properties, so a `@keyframes` rule
// and a CodeMirror theme reach the values StyleX inlines.
const styles = stylex.create({
  root: {
    '--motion-fast': motion.fast,
    '--motion-in-out': motion.inOut,
    '--motion-medium': motion.medium,
    '--motion-out': motion.out,
    '--motion-slow': motion.slow,
  },
})

// Subscribes the dev stylesheet to the plugin's `stylex:css-update` events so
// edits hot-reload; the virtual module resolves only under `devMode: 'css-only'`.
function StylexDevReload() {
  useEffect(() => {
    if (import.meta.env.DEV) void import('virtual:stylex:css-only')
  }, [])
  return null
}
