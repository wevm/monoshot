---
'monoshot': minor
---

Added `Api`, whose routes render a frame over HTTP. `POST /document` returns the standalone document a browser screenshots, and draws a twoslash run the caller resolved. `hono` is an optional peer, and is absent from a bundle that never mounts the routes.

```ts
import { Hono } from 'hono'
import { Api } from 'monoshot'

const app = new Hono().route('/v1', Api.route)
```
