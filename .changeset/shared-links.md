---
'monoshot': minor
---

Added `Codec.serialize`/`Codec.deserialize` for packing a frame's state into a URL fragment, so a snippet and its styling travel in a link.

```ts
import { Codec } from 'monoshot'

const hash = Codec.serialize({ code: 'const a = 1', theme: 'vitesse-dark' })
const state = Codec.deserialize(hash)
```
