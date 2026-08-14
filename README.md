<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./app/public/cover-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./app/public/cover-light.svg">
    <img alt="Monoshot" src="./app/public/cover-light.svg" width="454">
  </picture>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#quick-prompt">Quick Prompt</a> ·
  <a href="#skills--mcp">Skills &amp; MCP</a> ·
  <a href="#api">API</a> ·
  <a href="#cli">CLI</a> ·
  <a href="#license">License</a>
</p>

## Overview

Monoshot creates code images with type-aware editing, annotations, multiple languages, themes, exports, shareable links, and more.

Try it: [monoshot.dev](https://monoshot.dev)

## Quick Prompt

Prompt your agent:

```text
Use monoshot.dev/md and create a code snippet of simple viem usage. Use the golden gate dark theme.
```

## Skills & MCP

Add Monoshot as an agent skill:

```text
npx monoshot skills add
```

Or register the MCP server:

```text
npx monoshot mcp add
```

The server exposes `open`, `render`, `share`, and `themes` directly. Pass `embed: true` to `render` when the MCP client cannot read files from the server filesystem.

## API

Base URL: [monoshot.dev/api](https://monoshot.dev/api)

```sh
curl https://monoshot.dev/api/image \
  --header 'content-type: application/json' \
  --data '{"code":"const answer: number = 42","lang":"typescript","theme":"vitesse-dark"}' \
  --output code.png
```

JavaScript and TypeScript resolve Twoslash annotations automatically. Add a `^?` query to render an inferred type, or send `"twoslash": false` to disable type resolution.

### Reference

[OpenAPI schema](https://monoshot.dev/api/openapi.json)

## CLI

### Usage

```sh
npx monoshot render -c 'console.log("Hello, world!")' -o hello.png
npx monoshot render -c 'console.log("Hello, world!")' -o hello.svg
npx monoshot render -c 'console.log("Hello, world!")' --preview
npx monoshot render -c 'console.log("Hello, world!")' --embed --format json
npx monoshot share -c 'console.log("Hello, world!")' -t vitesse-light
```

> [!NOTE]
> Use `pnpx monoshot` with pnpm or `bunx monoshot` with Bun.

`--preview` displays the image with native terminal graphics when available and ANSI blocks otherwise. `--embed` includes a data URL for clients that cannot read the output path.

### Reference

```text
monoshot — Create code images with syntax highlighting, customizable themes,
and type-aware annotations.

Usage: monoshot <command>

Commands:
  open    Open the snippet in a browser.
  render  Render a snippet to an image.
  share   Build a link that opens the snippet in a browser.
  themes  List every theme.

Integrations:
  completions  Generate shell completion script
  mcp          Register as MCP server (add, doctor)
  skills       Sync skill files to agents (add, list)
```

Run `npx monoshot <command> --help` for command options and examples.

## License

[MIT](./LICENSE)
