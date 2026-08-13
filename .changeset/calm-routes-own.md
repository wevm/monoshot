---
'monoshot': major
---

Changed `Api.route` from a shared singleton to a factory that returns an independently owned route.

```diff
-const app = new Hono().route('/v1', Api.route)
+const app = new Hono().route('/v1', Api.route())
```
