---
'monoshot': patch
---

Fixed `Frame.render({ twoslash: true })` marking every untyped parameter, which reads as a mistake in a snippet that left its context behind. The editor already left those alone; a render now matches it.
