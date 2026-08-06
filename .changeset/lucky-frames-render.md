---
'monoshot': minor
---

Added `Frame.create` for rendering shiki-highlighted code frames, and `Theme.list`/`Theme.derive` for picking any bundled theme and deriving its frame palette.

```ts
import { Frame, Theme } from 'monoshot'

const frame = Frame.create()
const result = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
const palette = Theme.derive(result.theme)
// palette.page, palette.backdrop, palette.window
```
