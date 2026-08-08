---
'monoshot': minor
---

Added the `monoshot/headless` entrypoint, which screenshots a frame's standalone document through a Chrome you already have. `puppeteer-core` is an optional peer, so `engines.node` is now `>=22.12.0`.

```ts
import * as Headless from 'monoshot/headless'

const renderer = Headless.create()
const png = await renderer.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
await renderer.dispose()
```
