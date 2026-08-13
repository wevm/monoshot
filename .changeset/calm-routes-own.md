---
'monoshot': patch
---

Changed `Api.route` to return an independently owned route.

```ts
const app = new Hono().route('/v1', Api.route())
```
