---
'monoshot': minor
---

Added the `monoshot` command, which renders a source file to an image, builds a share link for it, and lists the bundled themes. The same definition serves those commands to agents over MCP through `--mcp`.

```bash
monoshot render app.ts --out app.png --theme github-light --scale 4
monoshot share app.ts
monoshot themes
```
