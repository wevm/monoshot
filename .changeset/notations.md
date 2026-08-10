---
'monoshot': minor
---

Reads the marks a snippet carries, the way a `^?` query is already read. `[!code hl]` marks a line, `[!code focus]` recedes every other line, `[!code ++]` and `[!code --]` read as a diff, and `@log`, `@error`, `@warn`, and `@annotate` draw a line of prose beside the code. Each mark reaches the window's edges with a bar down the side it starts on, and the comment itself is taken out of what is drawn.

```ts
const themes = ['vitesse-dark'] // [!code --]
const themes = ['vitesse-dark', 'nord'] // [!code ++]
// @warn: nord reads darker than the others
```
