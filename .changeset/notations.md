---
'monoshot': minor
---

Reads shiki's notation comments, so a snippet carries its own presentation the way a `^?` query does. `[!code hl]` marks a line, `[!code focus]` recedes every other line, and `[!code ++]` and `[!code --]` read as a diff. The comments are taken out of what is drawn.

```ts
const themes = ['vitesse-dark'] // [!code --]
const themes = ['vitesse-dark', 'nord'] // [!code ++]
```
