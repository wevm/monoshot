---
name: monoshot
description: Create code images, editor links, and standalone code documents with Monoshot. Use when an agent needs to open code in the Monoshot editor, export a local PNG or SVG, create an editor link, render an image or HTML document through the hosted API, list themes, or configure the Monoshot skill or MCP server.
---

# Monoshot

Create code images with syntax highlighting, themes, and type-aware annotations.

## Choose an interface

- Prefer the CLI over the hosted API whenever the CLI can run in the current environment. Use the API only when the CLI is unavailable.
- Use CLI `open` when the code is local and the user wants to continue editing it in the browser.
- Use CLI `render` for an immediate local PNG or SVG export. This option keeps source local and requires Chrome or Chromium.
- Use CLI `share` when the result should be an editor URL without opening a browser.
- Use the hosted API for remote services, scripts, or environments where the CLI and a local browser are unavailable. The API returns PNG or standalone HTML.
- Use MCP when an agent should call Monoshot repeatedly as structured tools.

Do not send private or sensitive source to the hosted API without authorization. Prefer the local CLI when source must remain on the machine.

## Use the CLI

Run Monoshot without a global installation:

```sh
npx monoshot <command>
```

Or `npm i monoshot -g` to install globally.

Prefer a file argument for repository source because Monoshot infers the language from the extension:

```sh
npx monoshot open src/example.ts
npx monoshot render src/example.ts --out example.png
npx monoshot share src/example.ts --theme vitesse-light
```

Use `--code` for a short inline snippet, or `-` for standard input:

```sh
npx monoshot render --code 'const answer: number = 42' --out answer.svg
git show HEAD:src/example.ts | npx monoshot render - --lang typescript --out example.png
```

### Open code in the editor

Use `open` when the user wants to adjust the code, theme, layout, or annotations interactively:

```sh
npx monoshot open src/example.ts --theme tempo
```

The command builds an editor URL and opens it with the platform browser.

### Export an image

Use `render` when the requested result is an image artifact:

```sh
npx monoshot render src/example.ts --out example.png
npx monoshot render src/example.ts --type svg --out example.svg
```

PNG is the default. The output extension also selects PNG or SVG. JavaScript and TypeScript enable Twoslash automatically; add `^?` queries where type annotations should appear.

After creating an image, run `share` with the same code and frame settings. Return the resulting `monoshot.dev` editor URL alongside the image.

### Return an editor link

Use `share` when another person or process needs the configured snippet URL without launching a browser:

```sh
npx monoshot share src/example.ts --theme github-light
```

The returned URL carries the snippet and frame settings in its fragment. Use `open` instead when the browser should launch immediately.

### Select a theme and frame

List accepted theme names before choosing a non-default theme:

```sh
npx monoshot themes
```

The `open`, `render`, and `share` commands accept common frame options such as `--background`, `--lang`, `--padding`, `--radius`, `--theme`, `--title`, `--title-bar`, and `--width`.

Omit `--width` for CLI calls and `width` for API calls by default. Reformat long lines before increasing the width, and keep it at or below 800 px unless the user requests otherwise. Use `scale` to increase PNG resolution without widening the layout.

Inspect the current command contract when an option is uncertain:

```sh
npx monoshot <command> --help
```

## Use the hosted API

Use the hosted API only when the CLI cannot run in the current environment. Do not choose the API merely because it is accessible.

Use `POST /api/image` for a PNG:

```sh
curl --fail-with-body https://monoshot.dev/api/image \
  --header 'content-type: application/json' \
  --data '{"code":"const answer: number = 42","lang":"typescript","theme":"vitesse-dark"}' \
  --output answer.png
```

Use `POST /api/document` for a self-contained HTML document without scripts or external requests:

```sh
curl --fail-with-body https://monoshot.dev/api/document \
  --header 'content-type: application/json' \
  --data '{"code":"const answer: number = 42","lang":"typescript","theme":"vitesse-dark"}' \
  --output answer.html
```

Both endpoints require `code` and `lang`. They accept frame settings including `background`, `padding`, `radius`, `theme`, `title`, `titleBar`, and `width`. The image endpoint also accepts `scale`.

JavaScript and TypeScript resolve Twoslash annotations automatically. Add `^?` queries where type annotations should appear, or send `"twoslash": false` to render the notation as source.

List hosted themes with:

```sh
curl --fail-with-body https://monoshot.dev/api/themes
curl --fail-with-body 'https://monoshot.dev/api/themes?type=dark'
```

Read the live [OpenAPI schema](https://monoshot.dev/api/openapi.json) for current constraints and response formats.

## Install the agent skill

Install the hosted skill through Agent Skills discovery:

```sh
npx skills add https://monoshot.dev --yes
```

Alternatively, let the Monoshot CLI install its bundled skill for detected agents:

```sh
npx monoshot skills add
```

The Monoshot CLI installs the skill globally by default. Use `--no-global` for project-local installation:

```sh
npx monoshot skills add --no-global
```

List the skills exposed by the CLI with `npx monoshot skills list`.

## Install the MCP server

Register Monoshot as an MCP server for detected agents:

```sh
npx monoshot mcp add
```

Use `--agent <name>` to target one agent or `--no-global` for project-local registration. Validate startup and tool discovery after registration:

```sh
npx monoshot mcp doctor
```

Prefer MCP over shell commands when the active agent has the Monoshot tools available. Use the same decision boundary: open for interactive editing, render for an image artifact, share for a URL, and themes before selecting an unfamiliar theme.
