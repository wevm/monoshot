---
'monoshot': minor
---

Added `Frame.render({ twoslash: types })`, which draws a twoslash run resolved elsewhere instead of resolving one. The value is plain data, so a build step, a worker, or a cache can produce it, and the render loads no compiler.

```ts
import { Frame } from 'monoshot'
import { createTwoslasher } from 'twoslash'

const code = 'const greeting = "hello"\n//    ^?\n'
const run = createTwoslasher()(code, 'ts')

const frame = Frame.create()
const result = await frame.render({
  code,
  lang: 'ts',
  theme: 'vitesse-dark',
  twoslash: { code: run.code, nodes: run.nodes },
})
```
