import * as fs from 'node:fs'
import * as path from 'node:path'
import { converter, formatHex } from 'culori'
import { bundledThemes } from 'shiki'
import type { ThemeRegistration } from 'shiki'

import { Theme } from '../src/index.js'

/**
 * Reads the colors each bundled theme paints with and writes them out for the
 * picker to show a theme by rather than by name alone.
 *
 * Run after changing which themes are offered:
 *
 * ```sh
 * pnpm exec tsx scripts/theme-swatches.ts
 * ```
 */

/** How many colors stand for a theme in the picker. */
const wanted = 3

const output = path.join(import.meta.dirname, '..', 'app', 'src', 'lib', 'swatches.ts')
const toOklch = converter('oklch')

const swatches = Object.fromEntries(
  await Promise.all(
    Theme.list().map(async (info) => {
      const load = bundledThemes[info.name]
      const theme = (await load()).default as ThemeRegistration
      return [info.name, { background: background(theme), colors: strongest(theme) }] as const
    }),
  ),
)

fs.writeFileSync(
  output,
  `/**
 * The colors each bundled theme paints with, read from the themes themselves by
 * \`scripts/theme-swatches.ts\`. Generated: edit the script, not this.
 */
export const swatches: Record<string, { background: string; colors: readonly string[] }> =
  ${JSON.stringify(swatches, null, 2)}
`,
)

console.log(`Wrote ${Object.keys(swatches).length} swatches to ${path.relative('.', output)}`)

function background(theme: ThemeRegistration): string {
  return theme.colors?.['editor.background'] ?? theme.bg ?? '#101010'
}

/**
 * The colors a theme is known by: the hues it paints most, gathered into arcs
 * weighted by how much of the theme each rule reaches and how vivid it is.
 *
 * The same reading the frame's own accent comes from, so the swatch and the
 * artwork behind it agree about what a theme looks like.
 */
function strongest(theme: ThemeRegistration): string[] {
  const arcs = new Map<
    number,
    { chroma: number; count: number; lightness: number; weight: number }
  >()
  for (const rule of theme.tokenColors ?? []) {
    const value = rule.settings?.foreground
    if (!value) continue
    const color = toOklch(value)
    if (!color || !Number.isFinite(color.h) || color.c <= 0.02) continue
    const reach = Array.isArray(rule.scope)
      ? Math.max(rule.scope.length, 1)
      : Math.max((rule.scope ?? '').split(',').length, 1)
    const arc = Math.floor((color.h ?? 0) / 30)
    const found = arcs.get(arc) ?? { chroma: 0, count: 0, lightness: 0, weight: 0 }
    found.chroma += color.c
    found.count += 1
    found.lightness += color.l
    found.weight += reach * color.c
    arcs.set(arc, found)
  }
  const ordered = [...arcs.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, wanted)
  return ordered.map(([arc, found]) =>
    formatHex({
      c: found.chroma / found.count,
      h: arc * 30 + 15,
      l: found.lightness / found.count,
      mode: 'oklch',
    }),
  )
}
