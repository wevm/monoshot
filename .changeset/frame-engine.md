---
'monoshot': minor
---

Added `Frame.create({ engine })`, which chooses how grammars are matched. Shiki's default compiles WebAssembly at runtime, which a Cloudflare Worker forbids, so a Worker asks for the JavaScript engine instead.

```ts
import { Frame } from 'monoshot'

const frame = Frame.create({ engine: 'javascript' })
```
