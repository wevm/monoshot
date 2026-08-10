---
'monoshot': minor
---

Added `Theme.marks`, the hues a mark carries, so an editor drawing them live and the image it exports agree on what they look like.

```ts
import { Theme } from 'monoshot'

Theme.marks.remove // the hue a deleted line reads in
```
