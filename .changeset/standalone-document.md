---
'monoshot': minor
---

Added `toDocument` to the renderer, rendering a frame as one standalone HTML document with no scripts, no external requests, and every font inlined.

```ts
const frame = Frame.create()
const html = await frame.toDocument({
  background: 'default',
  code: 'const a = 1',
  lang: 'ts',
  lineNumbers: true,
  padding: 64,
  radius: 12,
  theme: 'vitesse-dark',
  title: 'example.ts',
  titleBar: true,
  width: 720,
})
```
