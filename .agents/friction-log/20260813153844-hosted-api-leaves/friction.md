---
title: 'Hosted API leaves Twoslash queries unresolved by default'
severity: 'minor'
---

The CLI resolves JavaScript and TypeScript annotations automatically, but `/api/image` and `/api/document` require a pre-resolved `twoslash` payload. Agent instructions describe automatic resolution only under the CLI section, which makes the interface difference easy to miss.
