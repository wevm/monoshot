---
'monoshot': minor
---

Added `Api`, whose routes render a frame over HTTP and describe themselves at `/openapi.json`. `POST /document` returns the standalone document a browser screenshots and draws a twoslash run the caller resolved, and `GET /themes` lists the names `theme` accepts. `hono` and `@hono/zod-openapi` are optional peers, absent from a bundle that never mounts the routes.

```ts
import { Hono } from 'hono'
import { Api } from 'monoshot'

const app = new Hono().route('/v1', Api.route)
```
