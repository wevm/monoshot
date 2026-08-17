---
title: 'narrow frame title overlaps window lights'
severity: 'minor'
---

## What happened

A narrow frame with the title bar enabled places a medium-length title over the window lights. The title and controls become visually entangled.

## Expected

The title bar should reserve enough space for its controls or truncate the title before the two regions overlap.

## Reproduction

1. Render `const mcp: number = 42` with the title `MCP dogfood`.
2. Enable the title bar and omit an explicit width.
3. Inspect the generated image.
