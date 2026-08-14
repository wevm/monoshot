# Monoshot dogfood report

Date: 2026-08-14
Version: `0.0.7`
Production: [monoshot.dev](https://monoshot.dev/)
Commit: `4946bc9b19edb9482b8ddc7af03dc16d3a52ed7d`

Resolution: fixed locally on 2026-08-14. The original observations remain below as regression context.

## Summary

The App, CLI, MCP server, and HTTP API all complete their primary workflows after the fixes. Mobile editing is usable, generated commands are copy-ready, remote MCP clients can receive embedded renders, and the complete public API surface is documented.

## Coverage

| Entrypoint | Paths exercised                                                                                      | Result | Visual review                                               |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| App        | Editor, type-aware annotation, theme picker, export menu, desktop and mobile layouts                 | Passed | Desktop, tablet, and 390 × 844 mobile layouts reviewed      |
| CLI        | Help, version, themes, share, invalid theme, PNG render, SVG render, published-package invocation    | Passed | Tempo PNG and light-theme SVG reviewed at native dimensions |
| MCP        | Initialize, direct tool discovery, themes, share, invalid share, render with and without diagnostics | Passed | Successful and diagnostic-bearing renders reviewed          |
| API        | Health, themes, OpenAPI, document, image, invalid request                                            | Passed | Returned HTML document and PNG reviewed                     |

## Commands exercised

The local package commands ran from the repository root. The published-package commands ran through `npx`.

```sh
pnpm cli --help
pnpm cli --version
pnpm cli themes
pnpm cli share --code 'const answer: number = 42' --lang typescript --theme tempo
pnpm cli share --code 'const answer = 42' --theme nope
pnpm cli render --code 'const answer: number = 42' --lang typescript --theme tempo --output /private/tmp/monoshot-dogfood.8oKPXZ/cli-tempo.png --executable '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
npx --yes monoshot@latest --version
npx --yes monoshot@latest mcp doctor
pnpm cli mcp doctor
pnpm cli mcp serve
```

The MCP stdio session exercised `initialize`, `tools/list`, `search_tools`, `get_tool_details`, `call_read_tool`, and `call_write_tool`. The delegated Monoshot commands were `themes`, `share`, and `render`, including invalid-theme and TypeScript-diagnostic cases.

```sh
curl -sS https://monoshot.dev/api/health
curl -sS 'https://monoshot.dev/api/themes?type=light' -o /private/tmp/monoshot-dogfood.8oKPXZ/api-themes.json
curl -sS https://monoshot.dev/api/openapi.json -o /private/tmp/monoshot-dogfood.8oKPXZ/openapi.json
curl -sS -X POST https://monoshot.dev/api/document -H 'content-type: application/json' --data '{"code":"const answer: number = 42","lang":"typescript","theme":"github-light"}' -o /private/tmp/monoshot-dogfood.8oKPXZ/api-document.html
curl -sS -X POST https://monoshot.dev/api/image -H 'content-type: application/json' --data '{"code":"const answer: number = 42","lang":"typescript","theme":"tempo"}' -o /private/tmp/monoshot-dogfood.8oKPXZ/api-image.png
```

The App was exercised interactively at `https://monoshot.dev/`. A separate 390 × 844 headless browser capture provided the mobile visual check.

## Findings

### P1: The App is horizontally clipped on a mobile viewport

Resolved: the live frame is viewport-constrained, the controls use a bounded horizontal scroll surface, and mobile, tablet, and desktop layouts were visually rechecked.

At 390 × 844, the editor retains a desktop-width layout. The artwork, editor, metadata controls, and their labels extend beyond the viewport. Important controls cannot be seen or used without horizontal movement, and the composition is visibly cut off.

Reproduction:

1. Open `https://monoshot.dev/` in a 390 × 844 viewport.
2. Observe the code frame and bottom control bar.
3. The code frame extends past the right edge and the control bar is clipped on both sides.

Improvement: introduce a compact mobile composition, or scale the canvas and make the control bar intentionally scrollable with visible affordances.

### P1: Generated CLI and MCP follow-up commands do not shell-quote inline code

Resolved: generated commands now POSIX-quote file paths and option values, including quotes and multiline source.

Successful renders return a command shaped like:

```sh
monoshot share --code const answer: number = 42 --lang typescript --theme tempo
```

Copying that command fails with `no_snippet` because the shell splits the code into positional arguments. Multiline MCP input also produces a literal newline in the command.

Improvement: shell-quote the `--code` value, including embedded quotes and newlines, or write the snippet to a temporary file and return a file-based command.

### P2: MCP render results are local-path only

Resolved: `render` accepts `embed: true` and returns a base64 data URL alongside the path.

The MCP render tool returns JSON containing the generated file path, but no image content or MCP resource. This works for clients that share the server filesystem, but remote or sandboxed clients cannot inspect the result directly.

Improvement: return an MCP image content block or resource alongside the path.

### P3: Successful renders emit a Node warning

Resolved: the CLI entrypoint hides Node's unconfigured `localStorage` getter before loading Twoslash. Real CLI and MCP runs no longer emit the warning.

CLI and MCP renders complete successfully but write this warning to stderr:

```text
Warning: --localstorage-file was provided without a valid path
```

The warning makes successful automation look unhealthy and can pollute agent-visible MCP logs.

### P3: Theme selection is visually slow to scan

Resolved: every swatch now shows its theme name in a responsive, vertically scrollable grid.

The App theme picker uses unlabeled color swatches. A theme name appears only after hovering or focusing an individual swatch, so comparing named themes requires moving across every option.

Improvement: show persistent names, or add a searchable/list view while retaining the swatches.

### P3: MCP doctor terminology does not match protocol-visible tools

Resolved: Monoshot uses direct MCP discovery, so both surfaces list `open`, `render`, `share`, and `themes`.

`monoshot mcp doctor` reports four tools named `open`, `render`, `share`, and `themes`. An MCP `tools/list` call instead exposes four progressive-discovery gateway tools: `search_tools`, `get_tool_details`, `call_read_tool`, and `call_write_tool`.

The design works, but the doctor output can mislead someone debugging what an MCP client will see.

Improvement: distinguish command tools from protocol-visible gateway tools in the doctor output.

### P3: The live health endpoint is absent from OpenAPI

Resolved: health is owned by the shared API router and appears in mounted OpenAPI documents.

`GET /api/health` returns `{"status":"ok"}`, but `/api/openapi.json` documents only `/api/document`, `/api/image`, and `/api/themes`.

Improvement: include the health route if the OpenAPI document is intended to describe the complete public HTTP surface.

## Environment-specific friction

The default CLI render initially reported that Chrome could not be started inside the restricted sandbox. A later run with normal process permissions found the standard macOS Chrome installation automatically:

```text
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

The MCP server also required process-launch permission in the sandbox. No Chrome discovery product defect was reproduced.

## Visual review notes

- App desktop: the artwork, editor, type annotation, theme picker, and export menu were aligned, readable, and visually stable during the reviewed interactions.
- App mobile: the frame fits the 390 × 844 viewport, the controls scroll within their bounds, and the theme grid remains legible. Tablet and desktop layouts retain the intended proportions.
- CLI Tempo PNG: 1113 × 570; centered code frame, crisp text, and no clipping.
- CLI light SVG: intrinsic 1112.34375 × 570 with a `370.78125 × 190` view box; a native-size browser render confirmed that the earlier thumbnail crop was not present in the artifact.
- MCP Golden Gate Dark render: clean composition and syntax highlighting. Invalid TypeScript produced a legible inline `Cannot find name 'charge'.` diagnostic.
- API Tempo PNG: 1113 × 570 and visually equivalent to the CLI Tempo PNG.
- API document: rendered successfully as a compact intrinsic-size snippet document at the top-left of a larger browser viewport, with crisp text and no internal clipping.

## Evidence

Temporary artifacts created during the audit:

| Artifact                     | Path                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| Mobile App screenshot        | `/private/tmp/monoshot-dogfood.8oKPXZ/app-mobile.png`       |
| CLI Tempo PNG                | `/private/tmp/monoshot-dogfood.8oKPXZ/cli-tempo.png`        |
| CLI light SVG                | `/private/tmp/monoshot-dogfood.8oKPXZ/cli-light.svg`        |
| CLI light SVG browser render | `/private/tmp/monoshot-dogfood.8oKPXZ/cli-light-chrome.png` |
| MCP diagnostic render        | `/private/tmp/monoshot-dogfood.8oKPXZ/mcp-render.png`       |
| MCP successful render        | `/private/tmp/monoshot-dogfood.8oKPXZ/mcp-success.png`      |
| API image                    | `/private/tmp/monoshot-dogfood.8oKPXZ/api-image.png`        |
| API document                 | `/private/tmp/monoshot-dogfood.8oKPXZ/api-document.html`    |
| API document screenshot      | `/private/tmp/monoshot-dogfood.8oKPXZ/api-document.png`     |
| Fixed mobile App screenshot  | `/private/tmp/monoshot-mobile-puppeteer.png`                |
| Fixed mobile theme picker    | `/private/tmp/monoshot-mobile-themes.png`                   |
| Fixed tablet App screenshot  | `/private/tmp/monoshot-tablet-puppeteer.png`                |
| Fixed desktop App screenshot | `/private/tmp/monoshot-desktop-puppeteer.png`               |
| OpenAPI document             | `/private/tmp/monoshot-dogfood.8oKPXZ/openapi.json`         |

API checks returned seven light themes, a healthy status, valid image and document responses, and HTTP 400 with a field-specific message for an invalid theme. CLI and published-package checks both reported version `0.0.7`; local and published MCP doctor checks passed.
