import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen.js'

/** Constructs the app router over the generated route tree; called per request/render by TanStack Start. */
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
