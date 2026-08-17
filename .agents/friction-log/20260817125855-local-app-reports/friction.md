---
title: 'local app reports StyleX hydration mismatch'
severity: 'minor'
---

## What happened

Opening the local editor logs a React hydration mismatch because `data-style-src` line numbers differ between server and client output.

## Expected

The local editor should hydrate without console errors so runtime failures remain visible.

## Reproduction

1. Run `pnpm --filter app dev --host 127.0.0.1`.
2. Open the root editor.
3. Inspect the browser console.
