---
title: 'PNG export has no progress feedback'
severity: 'minor'
---

## What happened

The only PNG export runs at 6x and can take more than eight seconds. The editor shows no progress, completion, or failure state while capture runs.

## Expected

The export control should acknowledge an in-progress capture and report completion or failure.

## Reproduction

1. Open the editor with the default typed sample.
2. Select PNG.
3. Observe the control while the export is generated.
