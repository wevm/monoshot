---
'monoshot': minor
---

Added `Frame.render` for shiki-highlighted code frames and `Theme.list`/`Theme.derive` for picking any bundled theme and deriving its frame palette.

```ts
import { Frame, Theme } from 'monoshot'

const frame = await Frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
const palette = Theme.derive(frame.theme)
```
