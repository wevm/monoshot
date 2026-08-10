---
'monoshot': minor
---

Added the `monoshot/api` entrypoint, whose routes render a frame over HTTP. `POST /document` returns the standalone document a browser screenshots, and draws a twoslash run the caller resolved. `hono` is an optional peer.

```ts
import { Hono } from 'hono'
import * as Api from 'monoshot/api'

const app = new Hono().route('/v1', Api.create())
```
