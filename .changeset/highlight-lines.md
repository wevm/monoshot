---
'monoshot': minor
---

Added `highlightedLines`, which draws attention to some lines by dimming the rest. Carried by `Codec`, so a link, a render, and a request all describe it the same way; `monoshot render --highlight 3,7-9` spells it for the command line.

```ts
import { Frame } from 'monoshot'

const frame = Frame.create()
const html = await frame.render({
  code: 'const a = 1\nconst b = 2\n',
  highlightedLines: [2],
  lang: 'ts',
  theme: 'vitesse-dark',
})
```
