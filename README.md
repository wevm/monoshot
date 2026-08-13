<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./app/public/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./app/public/logo-light.svg">
    <img alt="Monoshot" src="./app/public/logo-light.svg" width="360">
  </picture>
</p>

<p align="center">Beautiful code images.</p>

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
Use monoshot.dev to create a code image for a TypeScript snippet that validates an API response. Use the Tempo theme and include type annotations.
```

## Skills & MCP

Add Monoshot as an agent skill:

```text
Run `npx monoshot skills add`, then use Monoshot to create a code image for the selected code.
```

Or register the MCP server:

```text
Run `npx monoshot mcp add`, then use the Monoshot MCP tools to create a code image for the selected code.
```

## API

Base URL: [monoshot.dev/api](https://monoshot.dev/api)

```sh
curl https://monoshot.dev/api/image \
  --header 'content-type: application/json' \
  --data '{"code":"const answer: number = 42","lang":"typescript","theme":"vitesse-dark"}' \
  --output code.png
```

### Reference

[OpenAPI schema](https://monoshot.dev/api/openapi.json)

## CLI

### Install

Install Monoshot globally:

```sh
npm i -g monoshot
pnpm add -g monoshot
bun add -g monoshot
```

### Usage

```sh
monoshot render -c 'console.log("Hello, world!")' -o hello.png
monoshot render -c 'console.log("Hello, world!")' -o hello.svg
monoshot share -c 'console.log("Hello, world!")' -t vitesse-light
```

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

Run `monoshot <command> --help` for command options and examples.

## License

[MIT](./LICENSE)
