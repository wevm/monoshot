---
'monoshot': minor
---

Added `Frame.render({ twoslash: true })`, which resolves the types a `^?` query asks for and draws them in flow, and turned it on for the TypeScript family in `monoshot render`. Also fixed `share` and `open` building a link against a base that already carries a fragment, and `render` accepting a scale that cannot produce an image.

```ts
import { Frame } from 'monoshot'

const frame = Frame.create()
const html = await frame.toDocument({
  code: 'const greeting = "hello"\n//    ^?\n',
  lang: 'ts',
  theme: 'vitesse-dark',
  twoslash: true,
})
```
