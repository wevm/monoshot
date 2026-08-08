---
'monoshot': minor
---

Added the `monoshot/twoslash` entrypoint for resolving a snippet's types, with positions mapped back onto the source as written.

```ts
import * as Twoslash from 'monoshot/twoslash'

const twoslash = Twoslash.create()
const result = twoslash.run("const greeting = 'hello'\n//    ^?")
// result.queries[0].text -> `const greeting: "hello"`
```
