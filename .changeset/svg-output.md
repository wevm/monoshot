---
'monoshot': patch
---

Added SVG output to the renderer and the command, written as vector markup rather than a raster.

```ts
import * as Headless from 'monoshot/headless'

const svg = await Headless.render({
  code: 'const a = 1',
  lang: 'ts',
  theme: 'vitesse-dark',
  type: 'svg',
})
```
