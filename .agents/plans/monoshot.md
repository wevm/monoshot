# Code Images: ray.so alternative — library + app + CLI/MCP/API

## Context

Build a code-screenshot generator (ray.so alternative) supporting every shiki theme and language, with TypeScript-playground-style auto-type-acquisition and twoslash annotations rendered live while editing and baked into exports — shipped as a **wevm-style npm library** consumed by a web app, a CLI + MCP server (incur), and an HTTP API (Hono), so agents and programs can generate code images.

User decisions:
- New repo, wevm library standards (ox / viem v3 / frog / incur patterns); copy **wevm/frog's AGENTS.md** in for TS/lib patterns (full verbatim copy captured in the research scratchpad).
- Library surface reused by: CLI + MCP via **wevm/incur**, and an API via **Hono** on Cloudflare Workers.
- Web app: Vite + TanStack Start + Hono worker (wallet-next-style internals). **StyleX** design system, Geist-inspired colors/typography, `light-dark()` theming.
- All 65 shiki themes; all shiki languages; twoslash/auto-install for TS/TSX/JS/JSX only.
- Exports: PNG (2x/4x/6x), SVG, copy-to-clipboard, shareable URL.
- Twoslash notation comments hidden in output (default stripping) → cleaned→raw position-mapping layer.
- Fonts: Geist Mono (code) + Geist Sans (UI), self-hosted, OFL 1.1.
- Shippable PRs; early focus is a design prototype.
- Name: **monoshot** (npm-available).

Research (source-verified 2026-08-05/06; the outputs below were session-local research artifacts — their distilled facts are inlined in this document):
- `tasks/w3ywvnz17.output` — ray.so internals, @typescript/ata, twoslash/@shikijs/twoslash, shiki 4.4.2, DOM-export libraries.
- `tasks/wwmpdecqv.output` — architecture design + adversarial critique (blocker fixes folded in below).
- `tasks/wp4jajbdy.output` — StyleX 0.19 integration + Geist token tables (scratchpad: `stylex.md`, `geist.md`, raw Vercel CSS).
- `tasks/w1xuzoptt.output` — wevm standards + incur + headless rendering (scratchpad: `wevm.md` incl. frog AGENTS.md verbatim, `headless.md`).

## Key research facts

### Engine (unchanged from reviewed design)
- **Editor**: CodeMirror 6 (textarea overlay breaks under twoslash's in-flow blocks; Monaco is multi-MB, no mobile). Own the ~200-line shiki-token bridge; block widgets from a StateField; `@codemirror/lint` push-model squiggles.
- **shiki 4.4.2** + `@shikijs/twoslash 4.4.2` (version-locked): `createHighlighterCore` + JS regex engine (no wasm), lazy per-theme/lang chunks, `tm-themes` metadata for the 65-theme picker. `rendererRich({ queryRendering: 'line', errorRendering: 'line' })` makes annotations in-flow static blocks that bake into images; identifier hovers stay `:hover`-gated (editor-only).
- **twoslash 0.3.9 / twoslash-cdn 0.3.9**: `typescript` pinned **`~5.9.3`** (npm latest 7.x is the Go port, no JS API; no twoslash path on TS 7 yet). Browser/worker: twoslash-cdn (ATA + vfs, IndexedDB fetch cache). **Node: `createTwoslasher()` defaults to an FS-backed vfs** — local `node_modules` types resolve free; ATA covers standalone snippets. `noErrorValidation` for keystroke tolerance. **Twoslash strips notations and remaps positions** (`result.code !== input`); with hidden notations every annotation position maps cleaned→raw via `meta.removals`.
- **Browser export**: `@zumer/snapdom` (foreignObject capture, Safari warmup, font subsetting), `modern-screenshot` fallback seam. Satori rejected (cannot render twoslash CSS).

### wevm library standards (verified against ox@main, viem@v3, frog@main, incur@main, zile@main)
- **Topology: library at repo root**, apps as sibling workspaces — frog's `pnpm-workspace.yaml` is literally `packages: [., app]` with `app/` a private Cloudflare Worker depending on `frog: workspace:*`. Not a `packages/` monorepo. `site/` (vocs) optional later.
- **Modules**: flat PascalCase namespace files in `src/` (`Frame.ts`, `Theme.ts`), colocated `X.test.ts`/`X.test-d.ts`, `internal/` private, `src/index.ts` re-exports namespaces (`export * as Frame from './Frame.js'`), `src/version.ts`.
- **Build: zile** (v0.0.30): exports point at source with a **`src` condition** (`{ "src": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" }`), `[!start-pkg]` package.json marker splits dev manifest from published manifest, `bin` + `bin.src` convention, `zile dev` symlinks on postinstall, publish = `zile publish:prepare && changeset publish && zile publish:post`.
- **Toolchain**: `vp` (vite-plus 0.2.8) for check/test/fmt (oxlint + oxfmt + vitest), `tsc -b` for types, changesets, `publint`/`attw`/`size-limit`/`knip` gates, tsconfig per ox base (NodeNext, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), ESM-only, Node >= 22, `sideEffects: false`, ship `SKILL.md` in `files`.
- **JSDoc**: TSDoc on every export with ` ```ts twoslash ` `@example` blocks (fitting, given what we're building), `declare namespace fn { Options / ReturnType / ErrorType }`.
- **incur 0.4.26**: `Cli.create(name, { args/options/env/output: zod, run(c) })` → one definition yields CLI, **stdio MCP server (`--mcp`)**, agent registration (`mcp add`), **HTTP handler `cli.fetch` with a streamable-HTTP `/mcp` endpoint + JSON command API + `/openapi.json`** (works as a Worker default export or mounted in Hono), and generated skill files (`skills add`). Same-package `bin` is the wevm pattern (frog). Pre-1.0: pin exact (frog pins 0.4.25); depends on an alpha MCP SDK.

### Headless rendering (CLI + API)
- **Invariant: every non-browser surface screenshots the same standalone HTML in Chromium.** The library emits a self-contained document (pre-rendered annotations, one inlined stylesheet, Geist Mono as data-URL `@font-face`, no JS).
- **CLI**: `puppeteer-core@^25` — system Chrome via `channel: 'chrome'` / `computeSystemExecutablePath`, `PUPPETEER_EXECUTABLE_PATH` override, consent-gated `@puppeteer/browsers` download fallback (~180 MB; `chrome-headless-shell` ~95–115 MB behind a fidelity-warning flag). Ships behind a `./headless` entrypoint with puppeteer-core as an optional peer so library consumers never download Chrome.
- **Worker API**: Cloudflare **Browser Run** (formerly Browser Rendering) — `@cloudflare/puppeteer` 1.3.0, `browser` binding, `setContent(html)` + `document.fonts.ready` + element screenshot with `deviceScaleFactor`; session reuse via `sessions()`/`connect()`/`disconnect()` + `keep_alive`. Paid plan includes 10 browser-hours/mo then $0.09/h (a ~2 s render ≈ $0.00005); free tier (10 min/day, 1 launch/20 s) is demo-only — **the API effectively requires Workers Paid**. The REST Quick Action `/screenshot` (accepts raw `html` + `selector` + `viewport.deviceScaleFactor`) is a valid zero-puppeteer v0.
- **Twoslash compute in-Worker is viable on paid**: `typescript@5.9.3` is 9.1 MB raw / **1.65 MB gzip** vs the 10 MB gzip Worker limit; 1 s startup budget (benchmark at implementation); ATA subrequests to jsdelivr work — KV-cache resolved type maps keyed by `package@version` (load-bearing, not an optimization).
- **Chromium caps** capture surfaces ~16,384 px/side — clamp scale by frame height everywhere. Cross-OS raster drift (macOS CLI vs Linux Browser Run) is real: pin/record Chrome versions, `--font-render-hinting=none` on Linux.
- **takumi** (`@takumi-rs/*`, real CSS-selector support, 1.5 MB gzip wasm, WOFF2 fonts via API) is the only credible non-Chromium engine — deferred as an optional "fast, close-but-not-pixel-identical" mode; not in v1.

### StyleX (0.19.0) + Geist — app design system
- `@stylexjs/unplugin` → `stylex.vite()` **before** the React plugin; for TanStack Start + `@cloudflare/vite-plugin` mirror the official redwoodsdk example: `devMode: 'css-only'`, `devPersistToDisk: true`, `runtimeInjection: false`, `useCSSLayers` object form; dev `<link href="/virtual:stylex.css">` in the root route head + client `import('virtual:stylex:css-only')` (virtual module name must match devMode — issue #1621). No first-party Start recipe — validate in the scaffold PR.
- Tokens: `stylex.defineVars` in `.stylex.ts` files with **`light-dark()`** color values (documented pattern; colors only — shadows use `@media` condition objects); `defineConsts` for breakpoints; `createTheme` for scoped overrides. `:root { color-scheme: light dark }`; manual override toggles `color-scheme`.
- Geist values extracted from Vercel production CSS (snapshot; rename tokens, "Geist-inspired"): 9 scales + backgrounds, 10 steps with official semantics (100–300 bg, 400–600 borders, 700–800 high-contrast, 900–1000 text), full light+dark oklch tables; exact type scale (heading/copy/label/button); shadow-border materials; radii 6/12; 4 px spacing; control heights 24/32/40/48. Fonts: `@fontsource-variable/geist` + `@fontsource-variable/geist-mono`.
- StyleX ships no reset, never touches CSS it didn't compile — shiki/CM6/twoslash CSS coexists; order via `@layer`. Hybrid rule: pure `defineVars` for StyleX-consumed tokens; plain `tokens.css` only for vars third-party CSS must read (`--code-*` metrics, `--twoslash-*`).

## Architecture

**Library core is pure and runtime-agnostic**: frame model → shiki+twoslash hast/HTML → standalone-document emitter. Surfaces are thin adapters:

| Surface | Twoslash compute | Raster |
|---|---|---|
| Web app | twoslash-cdn in a Web Worker (IndexedDB cache) | snapdom on the live offscreen DOM |
| CLI + MCP (incur) | twoslash Node FS-vfs (+ ATA for standalone snippets) | puppeteer-core + system/downloaded Chrome |
| API (Hono on Workers) | in-Worker twoslash (paid; KV-cached ATA) | Browser Run `setContent` + element screenshot |

**One keystroke (app)**: CM6 dispatch → [sync] shiki token StateField recolors; widgets/diagnostics map through `tr.changes` → [async 300 ms] worker `runSync` → hydrate + `render.annotated` + `meta.removals` position map → block widgets + lint → [async 1 s, import-lines changed] ATA `prepareTypes` with progress events. Hash write debounced 500 ms via the router.

**Two theming systems, never mixed**: app chrome uses Geist-inspired StyleX tokens; the frame interior is themed exclusively by `Theme.derive` output from the selected shiki theme.

## Repo topology (frog pattern: `packages: [., app]`)

```
monoshot/
├── package.json                # PUBLISHED library: zile, [!start-pkg], exports src/types/default, bin + bin.src
├── pnpm-workspace.yaml         # packages: [., app]; catalog pins; overrides: { monoshot: workspace:* }
├── AGENTS.md                   # copied from wevm/frog (verbatim in scratchpad wevm.md), + project addenda
├── SKILL.md                    # shipped in files (wevm convention; incur `skills add` generates command skills)
├── tsconfig.json / tsconfig.base.json  # ox base: NodeNext, exactOptionalPropertyTypes, noUncheckedIndexedAccess
├── vite.config.ts              # vp: fmt/lint config + vitest projects (unit + browser-playwright later)
├── .changeset/
├── src/                        # library — flat PascalCase namespace modules, colocated tests
│   ├── index.ts                # export * as Frame / Theme / Twoslash / Codec / Errors
│   ├── version.ts
│   ├── Frame.ts                # frame model: options schema, render → hast/html, toDocument() standalone HTML
│   ├── Theme.ts                # tm-themes metadata + derive(): gradient/chrome/editor/--twoslash-* vars (culori)
│   ├── Twoslash.ts             # run options, cleaned→raw position mapping (meta.removals), Node runner (FS vfs + ATA)
│   ├── Codec.ts                # share-state schema (zod) + hash serialize/deserialize (lz-string) — cross-surface contract
│   ├── Headless.ts             # ./headless entry: puppeteer-core adapter (optional peer), Chrome discovery/download
│   ├── Api.ts                  # ./api entry: Hono route factory (Browser Run binding), POST /image
│   ├── bin.ts + cli/           # incur CLI: render/share/themes commands → CLI + --mcp + skills
│   └── internal/
└── app/                        # PRIVATE web app workspace (app), wallet-next-style internals
    ├── wrangler.json           # main: ./worker/index.ts, nodejs_compat, browser binding (API PR), KV (share PR)
    ├── vite.config.ts          # cloudflare + tanstackStart + stylex.vite() + react + icons
    ├── worker/index.ts         # Hono: /api (health, image via lib Api, share), /s/:id on root app, Start fall-through
    └── src/
        ├── styles.css, theme/  # tokens.stylex.ts + consts.stylex.ts + tokens.css (--code-*, --twoslash-*)
        ├── lib/                # app-only: editor/ (CM6 bridges), twoslash/ (worker client + protocol), state, export (snapdom), highlighter, detect
        ├── workers/twoslash.worker.ts
        ├── ui/                 # StyleX primitives: Button, Input, Select, Menu, Switch, Segmented, Tooltip, Kbd
        └── routes/             # __root, index, design (gallery), -components/ (Frame, Editor, Controls, ThemePicker, ExportMenu, AtaStatus)
```

Library exports: `.` (pure core — no Node/browser APIs), `./headless` (puppeteer-core optional peer), `./api` (Hono route factory), bin `monoshot` (+ `monoshot.src`). Published `files`: `dist`, `src`, `SKILL.md`.

Catalog pins that matter: `@stylexjs/stylex 0.19.0` + `@stylexjs/unplugin 0.19.0` (exact), `shiki 4.4.2` + `@shikijs/twoslash 4.4.2` (locked pair), `twoslash 0.3.9`, `twoslash-cdn 0.3.9`, `typescript ~5.9.3` (peer of the library; tilde, never caret), `tm-themes` exact, `incur` exact (pre-1.0, frog pins exact), `zile`, `vp: npm:vite-plus`, `@codemirror/{state,view,commands,lint}`, `@zumer/snapdom`, `lz-string`, `culori`, `unstorage`, `highlight.js`, `puppeteer-core` + `@puppeteer/browsers` (optional peers), `@cloudflare/puppeteer`, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, plus the wallet-next framework catalog (`@tanstack/react-start`, `@cloudflare/vite-plugin`, `hono`, `react 19`, `wrangler`, `unplugin-icons`).

## Library surface (wevm-shaped)

- **`Frame`**: `Frame.render(options)` → `{ hast, html, annotations, css }` (shiki `codeToHast` + line transformer + `transformerTwoslash({ twoslasher: () => precomputed, throws: false, renderer: rendererRich({ queryRendering: 'line', errorRendering: 'line' }) })`); `Frame.toDocument(options)` → standalone HTML string (frame chrome + gradient + inlined stylesheet + Geist Mono data-URL `@font-face`, no JS) — the contract every headless surface screenshots. Options mirror `Codec.State`. `declare namespace Frame { render.Options / render.ReturnType / ... }`; TSDoc with twoslash examples.
- **`Theme`**: `Theme.list()` (tm-themes metadata), `Theme.derive(themeJson)` → gradient stops (accent hue ±25°, OKLCH), window chrome (bg = theme bg exactly), editor colors, complete `--twoslash-*` set generated from the actual style-rich.css variable list, squiggle recolor; **terminal achromatic fallback** (chroma 0 from `bg.L` — never NaN hues); unit test derives **all** bundled themes asserting parseability + contrast clamps.
- **`Twoslash`**: shared option/result types, `Twoslash.mapPositions(result, removals)` (the hidden-notations layer), `Twoslash.run(code, options)` for Node (FS-backed vfs default; ATA fetcher for standalone snippets). The app's Web Worker keeps its own twoslash-cdn wiring but imports the shared types + position mapping.
- **`Codec`**: the share-state schema (zod, `z.catch` per field: code/lang/theme/padding/background/lineNumbers/twoslash/title/width/highlightedLines) + hash `serialize`/`deserialize` (lz-string `compressToEncodedURIComponent`, short keys). Public cross-surface contract: app URLs, CLI `--share-url`, API request bodies.
- **`Headless`** (`./headless`): `Headless.render(state, { scale })` → PNG/SVG via puppeteer-core — system Chrome discovery (`channel`, `computeSystemExecutablePath`, `PUPPETEER_EXECUTABLE_PATH`), consent-gated `@puppeteer/browsers` install fallback; `setContent` + `document.fonts.load` + `fonts.ready` + element screenshot at `deviceScaleFactor`; scale clamped by the 16,384 px surface cap; records Chrome version in metadata.
- **`Api`** (`./api`): Hono route factory the app worker mounts — `POST /api/image` (Codec state JSON → twoslash in-Worker → `Frame.toDocument` → Browser Run session-reuse screenshot → PNG). v0 may delegate to the Quick Actions REST `/screenshot` with raw html + selector.
- **CLI + MCP** (`src/bin.ts` + `src/cli/`, incur): commands `render` (file/stdin → image; options: theme/lang/scale/out/twoslash), `share` (emit share URL via Codec), `themes` (list). One definition yields the CLI, `--mcp` stdio server, `mcp add` agent registration, skill files, and optionally `cli.fetch`'s HTTP `/mcp` mounted in the app worker.

## App specifics (carried from the reviewed design, critique fixes included)

- **Design system (StyleX + Geist)**: `app/src/theme/tokens.stylex.ts` (renamed Geist oklch scales via `light-dark()`, type scale, shadow-border materials, radii/spacing/control heights), `consts.stylex.ts`, `tokens.css` (only `--code-*` metrics + `--twoslash-*`); `@layer reset, vendor, tokens, stylex.*`; `src/ui/` primitives per Geist control specs; `/design` gallery route; scheme toggle via `color-scheme`.
- **Editor bridges** (`app/src/lib/editor/`): shiki token StateField (undebounced `codeToTokensBase`); twoslash block widgets from a StateField provided **directly** (CM6 block-widget rule), margins neutralized so height accounting matches, `eq()` on html, `docVersion` re-checked immediately before every dispatch + `line <= doc.lines` clamp; lint via push `setDiagnostics`, ranges clamped, squiggle recolored from the derived error token.
- **Worker client** (`app/src/lib/twoslash/`): lazy spawn on first TS-family edit; 300 ms run / 1 s ATA debounce (import-line prefilter); monotonic docVersion delivery; drain-to-latest in the worker after cold init; consecutive-failure notice; ATA typo detection via wrapped fetcher; `ata:*` progress events → AtaStatus pill.
- **Metrics contract (editor ↔ export)**: shared CSS block (`--code-*`) sets font/size/line-height/letter-spacing/tab-size/`white-space: pre-wrap`/no ligatures; `.cm-line` padding zeroed; export line numbers as an out-of-flow column mirroring the gutter; CM6 `height: auto`. Parity e2e asserts equal line boxes/y-offsets on a 120-line wrapped snippet.
- **State**: hash fragment only (privacy: never reaches the worker), written through the router (`router.navigate({ hash, replace: true, resetScroll: false })` — never bare `history.replaceState`), 500 ms debounce + flush on copy/export/blur, > 8 000-char warning. Export scale in localStorage.
- **Browser export**: offscreen mount of the frame with `Frame.render` html (never the CM6 editor), live-frame width measured and set explicitly, `document.fonts.ready` + double rAF, snapdom (`scale`, `embedFonts`, `exclude: ['[data-ignore-in-export]']`), area clamp (~33 MP mobile / ~130 MP desktop) + side clamp, transparent-canvas failure detection, promise-based ClipboardItem in the gesture, "SVG (browser-only)" labeling, capture seam = snapdom ∩ modern-screenshot APIs.
- **Defaults**: theme `vitesse-dark`; default TS snippet with one `^?` whose annotations ship as build-time precomputed `TwoslashReturn` JSON (worker spawns only on first edit; e2e budget: no typescript chunk before interaction). Twoslash toggle visible for TS-family only; hovers editor-only. `highlightedLines` ships with Alt+click. Short links: KV, nanoid, ~50 KB cap, 90-day TTL, response includes the canonical long URL (KV cross-PoP lag); `/s/:id` registered on the root Hono app (SPA fall-through would swallow it).

## Shippable PRs

Branches `jxom/<slug>`; conventional-commit titles; each PR deployable (library PRs land dark behind unpublished exports until release).

**PR 1 — `chore: scaffold`.** Workspace (`packages: [., app]`), library skeleton (zile + `[!start-pkg]` + exports with `src` condition + changesets + vp + tsconfig refs + `src/index.ts`/`version.ts`), AGENTS.md (frog copy + addenda), app shell (TanStack Start + Cloudflare + Hono `/api/health` + StyleX wiring + fontsource Geist), CI (check/types/test/build/size-limit) + preview deploy.
*Spikes inside*: StyleX dev wiring under Start + Cloudflare (`css-only` + `devPersistToDisk` + virtual-module link — no first-party recipe); a trivial module Web Worker chunks correctly (de-risks PR 7).
*Verify*: `pnpm dev` serves a StyleX-styled shell; `curl /api/health`; `zile build` + `tsc -b` + `vp test` green; preview deploys.

**PR 2 — `feat(app): design system`.** Geist-inspired StyleX tokens (`light-dark()` oklch scales, type scale, materials), `@layer` order, `src/ui` primitives, `/design` gallery, scheme toggle.
*Verify*: gallery renders every primitive in both schemes; focus/hover per Geist specs; dev/prod cascade parity.

**PR 3 — `feat: frame core + design prototype`** *(the immediate focus)*. Library v0: `Theme.list`/`Theme.derive` v0 (bg-lighten gradient + fixed twoslash palette per light/dark; full OKLCH derivation iterates later), `Frame.render` (shiki only, no twoslash), highlighter singleton. App: full editor-page UI with a **static** rendered sample incl. a mocked twoslash box — header, `Frame` (gradient, chrome, traffic lights, title input, padding presets, resize handles), `Controls`, `ThemePicker` (all 65, lazy chunks), visual-only `ExportMenu`.
*Verify*: deployed preview is a convincing prototype; theme switch recolors coherently for `github-light`, `synthwave-84`, `min-light`, `vitesse-dark`, `red`; design review on this PR (screenshots in thread).

**PR 4 — `feat(app): editing`.** CM6 replaces the static render: editor assembly, shiki token bridge, CM6 theme from `Theme.derive`, metrics contract, language auto-detect, in-memory store wiring controls.
*Pre-work spike*: CM6-vs-`<pre>` parity (wrapped lines, tabs, widgets, line numbers → equal line boxes, caret accuracy).
*Verify*: no keystroke lag at 100 lines; parity e2e green; Python/Rust paste auto-detects.

**PR 5 — `feat: codec + shareable URLs`.** Library `Codec` (schema + hash serialize/deserialize + tests); app hash wiring through the router, restore on load, copy-URL.
*Verify*: reload restores state exactly; round-trip unit tests; no router-location desync.

**PR 6 — `feat(app): browser export`.** `render`/`export` app modules, functional ExportMenu (PNG 2x/4x/6x, SVG, copy image, scale persistence).
*Verify*: PNG dimensions = frame size × scale (Playwright decodes blob); transparent PNG; clipboard in Chrome + macOS Safari (manual); no placeholders/handles in exports.

**PR 7 — `feat: twoslash engine` (lands dark).** Library `Twoslash` (types, `mapPositions`, Node runner); app worker (`twoslash.worker.ts`, twoslash-cdn + unstorage IndexedDB + wrapped fetcher) + protocol + client. Unit tests; no UI change.
*Pre-work spike*: twoslash 0.3.9 notation semantics — diff `result.code` vs input; validate the `meta.removals` map everything depends on.
*Verify*: protocol/hydrate/mapPositions tests; worker chunks separately (size-limit guards the entry).

**PR 8 — `feat(app): live twoslash`.** Block widgets, lint, twoslash branch in the render path, `--twoslash-*` derivation in `Theme.derive`, AtaStatus, toggle.
*Verify*: `^?` type box < 500 ms warm at raw-doc positions; error squiggle + line; `import { ref } from 'vue'` → ATA pill → real types (second session: IndexedDB hits); typo'd import surfaces "types not found"; half-typed code never blanks; non-TS docs never spawn the worker.

**PR 9 — `feat(app): annotated exports`.** Export consumes the cached annotated render (notation lines hidden per product decision); build-time precomputed default-snippet annotations; bundle-budget e2e.
*Verify*: 6x PNG bakes the `^?` box theme-coherently; landing renders annotations without loading typescript.

**PR 10 — `feat: headless + CLI + MCP`.** Library `Frame.toDocument()` emitter, `./headless` (puppeteer-core adapter + Chrome discovery/download), incur CLI (`render`/`share`/`themes`) with `--mcp`.
*Verify*: `monoshot render foo.ts -o out.png` matches the app export for the same state (same-OS Chrome); `monoshot render --twoslash` on a snippet importing `vue` resolves types via ATA; `--mcp` serves tools an MCP client can call; scale clamp at the 16,384 px cap.

**PR 11 — `feat: image API`.** Library `Api` route factory (Browser Run binding, session reuse, in-Worker twoslash with KV-cached ATA maps — or Quick Actions REST as v0); app worker mounts `POST /api/image`; wrangler `browser` binding + `gen:types`.
*Verify*: worker test round-trips state → PNG; latency acceptable warm (session reuse); startup benchmark for the typescript bundle inside the 1 s global-scope budget.

**PR 12 — `chore: share links + polish`.** `worker/share.ts` + `/s/:id`, short-link UI + long-URL warning, Alt+click line highlights, keyboard shortcuts (⌘S/⌘C/⌘⇧C), scale clamp UI, Safari/iOS + mobile pass, full e2e sweep, changeset + first npm release.
*Verify*: `pnpm test` + `pnpm test:e2e` + builds + size-limit green; short link restores identical state; publish dry-run (`publint`, `attw`) clean.

## Risks carried forward

- incur (0.4.x, alpha MCP SDK), zile (0.0.x), vp (0.2.x), StyleX (0.19, pre-1.0), snapdom (young): pin exact, expect minor-version churn.
- TS 7 has no twoslash path; the library pins `typescript ~5.9` as a peer — long-term migration unknown.
- Browser Run effectively requires Workers Paid; in-Worker typescript startup within the 1 s budget is estimated, not verified — benchmark in PR 11 (Quick Actions REST is the fallback).
- Cross-OS Chromium raster drift: pixel parity is per-OS/per-Chrome-version; pin versions, record in metadata.
- Geist token values are an unversioned production-CSS snapshot; keep them renamed and "Geist-inspired" (only the fonts are OFL-licensed).
- frog's AGENTS.md friction-logging section assumes frog wiring — keep only if this repo adopts `pnpx frog log`.

## Verification (end-to-end)

- Unit: `Theme.derive` over all bundled themes; `Codec` round-trip; `Twoslash.mapPositions`; `Frame` render/annotation extraction; protocol hydrate.
- E2E (Playwright): frame controls, export dimensions/transparency/URL restore, twoslash live + baked, editor↔export metrics parity, bundle budget.
- CLI: golden-image test (same state → app export vs CLI export on the same OS/Chrome).
- Manual: Safari (macOS + iOS) export + clipboard; both schemes across the design gallery; MCP tool call from an agent.
- Per-PR CI: `vp check`, `tsc -b`, `vp test`, builds, size-limit, publint/attw (library PRs), preview deploy.
