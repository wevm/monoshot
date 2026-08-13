# monoshot

## 0.0.5

### Patch Changes

- 789a0d2: The hosted API resolved Twoslash annotations for JavaScript and TypeScript by default.
- f955b45: Fixed local Tempo artwork rendering, Node globals in type annotations, and omitted widths to fit the longest rendered line.

## 0.0.4

### Patch Changes

- 841cb31: Updated Monoshot branding, documentation, and the default shared-link domain.
- 8aa51d1: Added optional inline terminal previews to the `render` command.
- 5d36293: Prevented large dependency graphs from clearing resolved types after acquisition.

## 0.0.3

### Patch Changes

- fdc7f5c: Added fixed-height rendering to document and image routes so shared-link previews retain consistent dimensions regardless of snippet length.
- 5fb0bc4: Read the compiler's lib files from the installed package in Node rather than fetching them, so resolution no longer depends on a network that can throttle it.
- 32ef06f: Raised the default render scale to 3 and turned the title bar off by default, leaving both settable.
- eeefa6a: Added SVG output to the renderer and the command, written as vector markup rather than a raster.

  ```ts
  import * as Headless from "monoshot/headless";

  const svg = await Headless.render({
    code: "const a = 1",
    lang: "ts",
    theme: "vitesse-dark",
    type: "svg",
  });
  ```

- f37fd5d: Added a Tempo theme, composed from Tempo's own artwork.

## 0.0.2

### Patch Changes

- 4596f09: Resolved a snippet's types from the npm registry rather than the caller's installed packages, so every surface draws the same types for the same imports.

## 0.0.1

### Patch Changes

- 5c0ee97: Initial release.
