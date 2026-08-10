---
'monoshot': minor
---

Added `POST /image` to `Api`, which screenshots the document in a browser Cloudflare runs. Pass `browser` a reader for the Browser Rendering binding; without one the route answers `503` and every other route is unaffected. `@cloudflare/puppeteer` is an optional peer, imported only when an image is asked for.

```ts
import { Api } from 'monoshot'

const routes = Api.create({ browser: (c) => (c.env as Env).BROWSER })
```
