---
'monoshot': major
---

Removed line numbers. The `lineNumbers` field is gone from the share state, the `POST /document` body, and the CLI.

```diff
- monoshot render app.ts --line-numbers
+ monoshot render app.ts
```
