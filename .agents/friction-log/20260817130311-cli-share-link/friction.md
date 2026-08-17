---
title: 'CLI share link drops composed theme wallpaper'
severity: 'major'
---

## What happened

Rendering with `--theme golden-gate-dark` uses the Golden Gate wallpaper, but sharing the same code and theme opens the editor with the Gradient background selected. The exported image and editor link do not match.

## Expected

A share link created with the render command’s suggested settings should restore the same theme, background, and frame appearance.

## Reproduction

1. Render inline TypeScript with `--theme golden-gate-dark`.
2. Run the matching `share` command suggested by the render result.
3. Open the returned editor URL.
4. Compare the wallpaper export with the gradient editor state.
