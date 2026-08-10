---
'monoshot': minor
---

Added `Frame.create({ engine })`, which chooses how grammars are matched. Shiki's default compiles WebAssembly at runtime, which a Cloudflare Worker forbids, so a Worker passes shiki's JavaScript engine instead.

```ts
import { Frame } from 'monoshot'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const frame = Frame.create({ engine: createJavaScriptRegexEngine() })
```
