# Monoshot dogfood report

Date: 2026-08-17

Revision: `f7cda8272a0c57d0702cd443a5ee897bb9c16df8`

Environment: macOS, Node.js 25.9.0, local development server and hosted API

## Summary

All public entrypoints were exercised with TypeScript and Twoslash content. App states and generated HTML, SVG, and PNG artifacts were reviewed visually at desktop and mobile sizes.

| Entrypoint | Result                                                                                              | Visual review                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| App        | Works; the mobile blocker is fixed and two minor frictions remain                                   | Desktop editor, settings, background changes, title bar, padding, PNG action, and 390 × 844 mobile layout |
| CLI        | Render, share, themes, and validation paths work; share does not preserve composed wallpaper themes | Golden Gate Dark PNG and SVG, Twoslash output, and the returned share URL                                 |
| MCP        | Doctor and all four tools work; share inherits the CLI mismatch                                     | PNG render, embedded Tempo SVG, and editor URL                                                            |
| API        | Local and hosted document, image, themes, health, and validation paths work                         | Local and hosted PNG responses plus the standalone HTML document                                          |

## Findings

### Resolved: Mobile controls hid the editor

At 390 × 844, the full-height controls drawer fills the viewport. The artwork is not visible, so background, syntax, and window changes cannot be previewed.

Expected: keep a visible preview area or provide a clear way to dismiss or switch away from the controls.

Resolution: the mobile drawer now has a branded header with a close action. A controls icon restores the drawer from the editor, and the drawer remains mounted so its state and scroll position are retained.

Reproduce:

1. Run the App and open the root editor at 390 × 844.
2. Wait for the default sample to render.
3. Observe that only the controls drawer is visible.

Resolved friction log: `20260817130111-mobile-drawer-hides`

### Major: Share links drop composed-theme wallpapers

`render --theme golden-gate-dark` produces the Golden Gate wallpaper, but the matching `share` URL opens the editor on the Gradient tab with the default gradient. The generated image and shared editor state do not match. MCP `share` uses the same path and has the same behavior.

Expected: restore the same syntax theme, background mode, wallpaper, and frame settings used by render.

Reproduce:

1. Render TypeScript with `--theme golden-gate-dark`.
2. Run the matching `share` command suggested by the render result.
3. Open the returned URL and compare it with the rendered image.

Friction log: `20260817130311-cli-share-link`

### Minor: Narrow title bars overlap window controls

A narrow frame with the title bar enabled places `MCP dogfood` over the third window light.

Expected: reserve space for the window controls or truncate the title before the regions overlap.

Friction log: `20260817130826-narrow-frame-title`

### Minor: PNG export has no progress feedback

The App's only PNG export is a 6x capture and can take more than eight seconds. The button shows no progress, completion, or failure state during capture.

Expected: acknowledge the active export and report completion or failure.

Friction log: `20260817130052-png-export-has`

### Minor: Local App reports a hydration mismatch

The local browser console reports a React hydration mismatch because StyleX `data-style-src` line numbers differ between server and client output. TanStack Router also warns that the route's `Page` export cannot be code split.

Expected: local development should hydrate without console errors so application failures remain easy to identify.

Friction log: `20260817125855-local-app-reports`

## Coverage

### App

- Opened the root editor and confirmed the default Golden Gate Dark wallpaper, TypeScript detection, syntax highlighting, and Twoslash annotation.
- Switched to a gradient, toggled the title bar, and changed padding while observing the preview.
- Exercised PNG export and monitored browser download events.
- Reviewed the editor at 1280 × 720 and 390 × 844.
- Inspected browser logs after hydration and interaction.

### CLI

- Listed all 25 themes as JSON.
- Rendered Golden Gate Dark PNG and SVG outputs with a title, title bar, and Twoslash query.
- Opened both output formats and inspected layout, wallpaper, syntax, and type annotation rendering.
- Generated and opened a share URL.
- Confirmed concise nonzero JSON errors for an unknown theme, missing code, and an output-extension conflict.

### MCP

- Ran `mcp doctor`; it reported four tools with no warnings or errors.
- Initialized the stdio server and listed `open`, `render`, `share`, and `themes` through JSON-RPC.
- Called every tool and checked structured responses.
- Inspected a PNG render and an embedded Tempo SVG in a browser.
- Confirmed an invalid render theme returns an MCP tool error rather than terminating the server.

### API

- Checked local and hosted `/api/health` responses.
- Inspected the OpenAPI document and confirmed `/api/document`, `/api/health`, `/api/image`, and `/api/themes`.
- Generated local HTML and PNG responses, then inspected both visually.
- Generated and inspected the hosted PNG response.
- Confirmed 400 JSON errors for an unknown theme, missing code, and an unexpected field.

## Notes

- The App's PNG action did not expose a detectable in-app browser download event during the observation window. The finding is limited to missing feedback; CLI and API PNG generation both completed successfully.
- The mobile blocker was fixed after this pass. Detailed records for the remaining findings are in `.agents/friction-log/`.
