---
'monoshot': minor
---

Moved what a frame is drawn from onto the things that own it: a theme states the geometry and artwork it wants, `Codec.strict` states every field's bounds, and the renderer fades source it cut short.

```ts
import { Api, Browser, Codec, Frame, Theme, Twoslash } from 'monoshot'

// A theme composed from artwork states the radius that artwork wants, which
// `toDocument` applies when the caller pins none.
Theme.info('tempo')?.radius // 0
Theme.info('tempo')?.artwork // true

// The picture itself ships with the surface, not the package.
Api.create({ picture: ({ theme }) => load(`${theme}.webp`) })

// Source cut short of its snippet fades at the window's bottom edge.
await Frame.create().toDocument({ code, lang: 'ts', theme: 'nord', truncated: true })

// Bounds are stated once, as data and as a schema that refuses rather than
// falls back. `Codec.schema` still falls back, for links.
Codec.bounds.radius // { max: 24, min: 0 }
Codec.strict.shape.radius.safeParse(99).success // false

// The type resolver takes its environment, rather than sniffing for one.
Twoslash.create({ compiler, load, storage })

// Newly published: the metrics a frame is laid out on, the Worker capture, the
// languages the resolver reads, and the tag grammar the export draws.
Frame.metrics.code.line
Browser.fit({ height, width }, 3)
Twoslash.languages.has('tsx')
Twoslash.tagged('// @error: nope')
```
