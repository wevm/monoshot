---
title: 'App typecheck requires a prior app build'
severity: 'minor'
---

Running `pnpm --dir app check:types` in a fresh checkout fails because `app/src/routeTree.gen.ts` does not exist. Run `pnpm --dir app build` first.
