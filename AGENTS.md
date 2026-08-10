# Agent Guidelines

## Friction Logging

- Log papercuts and friction (tooling, docs, APIs, tests, conventions) as you hit them with `pnpx frog log`.
- Do not add global, system, or internal friction.
- Run `pnpx frog list` first to see what is already known.

## TypeScript Conventions

- Treat `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` as design constraints. Include `| undefined` when an optional property can explicitly receive `undefined`, and narrow indexed reads before use.
- Use `readonly T[]` for array types. Preserve mutable arrays only when mutation is part of the contract.
- Use `type` for project-owned shapes. Use `interface` only when declaration merging or an external ambient contract requires it.
- Include `.js` extensions on relative imports and exports so source remains valid under NodeNext ESM.
- Author every source file and script in TypeScript; `.js` files are banned. Node runs TypeScript natively (`node script.ts`), so scripts need no build step.
- Import module-shaped internal files as namespaces (`import * as Store from './Store.js'`) and access members through the module name. Named imports are fine for types, leaf helpers, command handlers, and third-party APIs that are not module namespaces.
- Import Node built-ins as namespaces unless the neighboring code or API is clearer with a named import.
- Re-export public module files as namespaces (`export * as Store from './Store.js'`). Avoid flattening sibling-module symbols into a barrel.
- Use static imports. Reserve dynamic imports for a real runtime or bundle boundary, not dependency-cycle workarounds.
- Use `import type` and `export type` where an import or export is type-only.
- Use functions and plain data for normal APIs. Classes are limited to errors and framework-required entrypoints such as Durable Objects.
- Keep error classes in the module that throws them, below the public functions and types. Set custom error `name` values to the namespaced form, such as `Config.InvalidError`.
- Use unions or `as const` objects instead of enums.
- Prefer `camelCase` constants. Preserve uppercase names only when they mirror an external protocol or established neighboring code.
- Use `const` generic parameters when callers should retain literal or tuple types.
- Default optional option bags in the signature (`options: fn.Options = {}`), not with `options?: fn.Options` and downstream fallback logic.
- Name typed option bags `options`. Use a domain noun only when the value is not an options bag.
- Prefer one named object parameter over several positional parameters. An instance-like receiver such as `client`, `cache`, or `store` may be the first positional parameter, followed by an options bag.
- Put a function's parameter, return, and error types in a matching `declare namespace` (`resolve.Options`, `resolve.ReturnType`, `resolve.ErrorType`). Keep a sibling exported type only when several functions share the domain type.
- Avoid inline object types on local variables. When an explicit local object type improves clarity, name it directly above the use.
- Do not extract a named type until it is reused or makes a difficult shape materially easier to read.
- Keep shared domain types beside the module that owns the concept.
- Let declared return types constrain intermediate expressions. Avoid redundant local annotations.
- Return values directly unless a binding is reused or gives a complex expression a useful name.
- For a fallible local derivation, prefer an IIFE expression over a mutable variable assigned across `try` and `catch` blocks.
- Destructure when reading several properties. When normalizing one field, read `options.field` directly instead of creating a second name.
- Prefer short names whose meaning is clear from local context, such as `options`, `client`, `entry`, and `fn`.
- Keep wire formats, ordered tuples, protocol fields, and other order-sensitive shapes explicit. Do not alphabetize data whose order has meaning.
- Avoid new `any`. Use a precise boundary type, validation, narrowing, or the smallest justified assertion.
- Do not use section-divider comments. Use exports, TSDoc, and whitespace to express module structure.
- Comment invariants and non-obvious reasons, not line-by-line mechanics. Keep comments independent of plans, task IDs, and prior versions.

## Module and Instance Conventions

- Organize each module file as one conceptual namespace containing its public types, constants, functions, and errors. Consumers should read calls as `Module.operation(...)`.
- Prefer stateless module functions for pure behavior. Do not create an instance when inputs fully describe the operation.
- When behavior needs dependencies or lifecycle state, expose a factory such as `Module.create(options)` or `Module.runtime(options)` that returns a plain object of operations and data.
- Construct instances explicitly at the application boundary and pass them down. Do not hide construction in imports or module-scope singletons.
- Scope an instance to the lifecycle that owns its state, such as one CLI run, Worker isolate, request pipeline, or test. Do not share mutable state more broadly than required.
- Inject environment-specific capabilities through factory options or narrow structural types. Keep filesystem, network, cache, clock, and platform bindings out of domain modules.
- Type dependencies by the smallest capability the module consumes, not by the concrete SDK client. This keeps adapters interchangeable without wrapper classes.
- Let factory operations close over shared dependencies and state. Do not return methods that depend on `this` or require binding.
- Name the returned public shape after its role (`Runtime`, `Client`, `Cache`, `Store`) when that role is meaningful. Use `create.ReturnType` for a factory-specific shape that has no independent domain name.
- Keep one authoritative instance value. Derive related helpers and views from that instance instead of duplicating configuration or state.
- Keep mutable caches and registries private to the instance. Expose explicit operations, and provide reset or disposal only when the lifecycle requires it.
- Avoid side-effect registration. `sideEffects: false` means an import used only to install global behavior can disappear from a bundle.
- Keep default implementations directly reachable from the factory or resolver that selects them so bundlers can tree-shake unused paths.
- Pass an existing receiver first to stateless operations (`Github.publish(client, options)`). Create a factory only when several operations genuinely share dependencies, state, or lifecycle.
- Keep transport-independent planning, parsing, and normalization pure. Put filesystem, GitHub, and Worker behavior in thin adapters around that core.
- Keep internal helpers under `internal/` and export them only when another module has a real contract with them.
- Add new public modules through the owning entrypoint as documented namespace exports. Keep the public surface lean and derive values that the library already knows.
- A framework-mandated class should delegate reusable logic to module functions so the class remains a small lifecycle adapter.

## Type Inference Conventions

- Preserve literal inputs through public helpers when those literals affect the output type.
- Keep generic types flowing from inputs through callbacks and return values. Do not erase them to `any` at an internal seam.
- Prevent public callbacks, options, and return values from leaking `any`.
- Add colocated `.test-d.ts` coverage with `expectTypeOf` when public inference or narrowing changes.
- Revisit inference after changing an API. Prefer a narrower useful contract over a broad type that merely compiles.

## Abstraction Conventions

- Start with concrete code and extract only after repeated uses reveal a stable shared contract.
- Prefer small local duplication over an abstraction that adds flags, modes, or call-site-specific branches.
- Wait for at least three concrete uses before introducing a general abstraction unless a hard boundary already exists.
- Optimize for code that is easy to change, not maximum DRYness.
- Keep authoritative state, configuration, schemas, and constants in one place; derive dependent values.
- Avoid wrappers that only rename another function or mirror an SDK without narrowing capabilities or adding a domain contract.

## Documentation Conventions

- Add TSDoc to every public export and public type property. Write or update the contract documentation alongside the implementation.
- Document caller-visible purpose, inputs, output, defaults, errors, and side effects. Keep low-level wiring in nearby implementation comments.
- Keep examples small and focused on the exported behavior.
- Update the owning entrypoint documentation when adding or changing a public module.

## Prose Conventions

Applies to comments, TSDoc, commit messages, and pull requests.

- Write about the code, not about the person using it. Avoid second person.
- Describe behavior in technical terms rather than by the experience it produces. Prefer `answers before acquisition finishes` over `keeps the editor feeling fast`.
- State an invariant or a reason the code cannot show on its own. Leave out justification the code already makes plain.
- Vary sentence construction. One shape repeated across a file, such as an assertion followed by a colon and its reason, reads as a writing style rather than as information.
- Keep pull request titles and descriptions to the change and its technical reason. Omit product framing.

## Testing Conventions

- Colocate unit and type tests with the module they cover.
- Give each exported function under test its own `describe('functionName', ...)` block.
- Prefer inline snapshots for stable structured values and thrown errors. Remove nondeterministic fields before snapshotting the remaining object.
- Test observable behavior, meaningful edge cases, and public errors. Do not derive expected values from the implementation under test.
- Exercise pure functions directly and composed behavior through the real adapter boundary. Avoid mocks when a real local implementation or narrow in-memory adapter is practical.
- Add deterministic regression coverage for every bug fix.
- Write behavioral and type tests alongside the implementation rather than after the module is complete.

## Workflow Conventions

- Use the smallest repository script that covers the changed behavior. Run focused tests while iterating.
- Run `pnpm check:types` after TypeScript changes.
- Run `pnpm test <paths>` for focused tests and `pnpm test` when the change warrants the full suite.
- Treat `pnpm check` as mutating because it applies fixes. Inspect and keep only task-related changes.
- Run `git diff --check` and inspect the final diff before reporting completion.

## Git Conventions

- Conventional commits, lowercase, no trailing period: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`. Scope optional.
- Name the thing that changed, in the identifiers the codebase already uses. Prefer `feat: return annotation styles from Frame.render` over `feat: return the styles annotated markup needs`.
- State the change, not the reason for it. Leave `because`, `so that`, and `in order to` out of the subject.
- Write each message to stand alone for a reader who has not seen the pull request or the task that produced it.
- Keep the pull request title accurate as the branch grows: a squash merge makes it the message that lands on `main`, and the branch's own messages disappear.
- Never force push and never amend a pushed commit. Correct a mistake with a follow-up commit.

## UI Conventions

- Build interactive components on Base UI (`@base-ui/react`). Do not hand-roll focus management, dismissal, positioning, roving focus, or ARIA wiring, and do not reimplement behavior with React state that a Base UI primitive already owns.
- Style Base UI parts with StyleX through their `data-*` state attributes (`:is([data-checked])`, `:is([data-highlighted])`, `:is([data-popup-open])`), never JavaScript-toggled classes.
- Native elements are correct when the platform already provides the whole behavior (`input`, `select`, `button`); reach for Base UI as soon as a component needs a popup, a group, or coordinated state.
- Color comes from `light-dark()` tokens in `theme/tokens.stylex.ts`. Never write a scheme-specific override at a use site.
- `.stylex.ts` files hold only `defineVars`/`defineConsts` named exports, and must be imported relatively: the StyleX compiler resolves them itself and does not understand the `#/*` subpath imports used everywhere else.

## Repository Layout

- The repo root is the published `monoshot` library: flat PascalCase namespace modules in `src/` with colocated tests, built with `zile`, checked with `vp`.
- `app/` is the private web app (`app`): TanStack Start + Hono on Cloudflare Workers, StyleX design system. It consumes the library via `workspace:*`.
- Library core stays pure and runtime-agnostic. Browser, CLI, and Worker behavior live in thin adapters (`./headless`, `./api` entrypoints, `app/`).

## Commands

- `pnpm check` formats and lints (mutating). `pnpm check:types` type-checks the library; the app has its own `check:types`.
- `pnpm test` runs library tests. `pnpm build` builds the library with zile.
- `pnpm cli <command>` runs the CLI from source through tsx, which resolves the `.js` specifiers Node cannot. No build step.
- `pnpm --filter app dev` runs the web app; `gen:types` regenerates `worker-configuration.d.ts` after wrangler config changes.

## Motion Conventions

- Every interactive element acknowledges the pointer. A control with no press state reads as a picture of a control.
- Press feedback is `transform: scale(0.97)` on `:active`, 140ms, on the element itself. It fires on press, not on release.
- Hover growth is `scale(1.14)` for swatch-sized targets and stays behind `@media (hover: hover) and (pointer: fine)`; touch reports a hover on tap.
- Animate `transform` and `opacity`. `height` is allowed where there is no transform equivalent (a collapsing panel), and `filter` only where the blur is the effect being asked for.
- Curves and durations come from the `motion` consts in `app/src/theme/tokens.stylex.ts`, never hand-rolled per component: `out` for entrances and presses, `inOut` for a value moving between two known states.
- Springs belong to surfaces the user can interrupt or that carry momentum (a panel opening, a value rolling). Fixed curves belong to hover and press.
- A selection that moves between siblings uses one shared element with Motion's `layoutId` so it slides, rather than one indicator per sibling blinking on and off.
- Reduced motion is part of the implementation, not a follow-up: wrap Motion trees in `MotionConfig reducedMotion="user"` and keep opacity while dropping movement.
