# monoshot

Beautiful code images with type-aware twoslash annotations.

Renders shiki-highlighted code frames — every shiki theme, every shiki language — with TypeScript playground-style auto type acquisition, so `// ^?` type queries and error annotations appear in the image. Ships as a library, a web app, a CLI + MCP server, and an HTTP API.

> Work in progress.

## Development

```sh
pnpm install
pnpm --filter app dev   # web app
pnpm test                         # library tests
pnpm check                        # format + lint (mutating)
```
