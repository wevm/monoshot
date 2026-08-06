---
'monoshot': minor
---

Added `tokens` to the renderer, for a surface that draws its own text and needs colors rather than markup.

```ts
const frame = Frame.create()
const { theme, tokens } = await frame.tokens({ code, lang: 'ts', theme: 'vitesse-dark' })
```
