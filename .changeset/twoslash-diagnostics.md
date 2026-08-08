---
'monoshot': minor
---

Added `diagnostics` to a twoslash result, carrying what the compiler objected to against the source as written.

```ts
const result = Twoslash.run("const n: number = 'x'")
result.diagnostics[0]?.text // Type 'string' is not assignable to type 'number'.
```
