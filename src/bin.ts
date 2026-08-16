#!/usr/bin/env node

// Node exposes `localStorage` as a warning getter unless a storage file was
// configured. Twoslash only probes for browser storage, so hide that getter.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined })

const Cli = await import('./Cli.js')

await Cli.create().serve()
