---
'monoshot': major
---

Removed the shared `Api.route` singleton in favor of explicitly owned routes.

```diff
-const app = new Hono().route('/v1', Api.route)
+const app = new Hono().route('/v1', Api.create())
```
