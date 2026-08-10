---
'monoshot': patch
---

`Frame.render` returns the styles a marked snippet needs, so `[!code hl]`, `[!code focus]`, diffs, and tags are visible wherever the markup is embedded rather than only in a standalone document.
