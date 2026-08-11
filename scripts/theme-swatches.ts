import * as fs from 'node:fs'
import * as path from 'node:path'
import { converter, formatHex } from 'culori'
import { bundledThemes } from 'shiki'
import type { ThemeRegistration, ThemeRegistrationResolved } from 'shiki'

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

/** Below this chroma a color reads as grey rather than as a hue. */
const neutral = 0.04

/** What a rule naming no scope counts for, in scopes it stands in place of. */
const unscoped = 8

const output = path.join(import.meta.dirname, '..', 'app', 'src', 'lib', 'swatches.ts')
const toOklch = converter('oklch')

const swatches = Object.fromEntries(
  await Promise.all(
    Theme.list().map(async (info) => {
      // A composed theme is already a theme; a bundled one is a name to load.
      const made = Theme.composed.find((one) => one.name === info.name)
      const load = bundledThemes[info.name as keyof typeof bundledThemes]
      const theme = (made ?? ((await load()).default as ThemeRegistration)) as ThemeRegistration
      // The backdrop the frame would draw for it, so a swatch is the artwork in
      // miniature rather than a color chart.
      const palette = Theme.derive(theme as ThemeRegistrationResolved)
      return [
        info.name,
        {
          backdrop: `linear-gradient(${palette.backdrop.angle}deg, ${palette.backdrop.from}, ${palette.backdrop.to})`,
          colors: strongest(theme),
        },
      ] as const
    }),
  ),
)

fs.writeFileSync(
  output,
  `/**
 * The colors each bundled theme paints with, read from the themes themselves by
 * \`scripts/theme-swatches.ts\`. Generated: edit the script, not this.
 */
export const swatches: Record<string, { backdrop: string; colors: readonly string[] }> =
  ${JSON.stringify(swatches, null, 2)}
`,
)

console.log(`Wrote ${Object.keys(swatches).length} swatches to ${path.relative('.', output)}`)

/**
 * The colors a theme is known by: what it paints the most of a snippet in.
 *
 * Weighed by how far each rule reaches and nothing else. Weighing by how vivid
 * a color is finds the accent a theme decorates with, which is a different
 * question: a theme whose code is mostly off-white is known by that off-white,
 * not by the pink it uses twice.
 */
function strongest(theme: ThemeRegistration): string[] {
  // The same field under two names; a theme carrying both would otherwise have
  // every rule counted twice.
  const rules = theme.tokenColors ?? theme.settings ?? []
  const groups = new Map<string, { colors: Map<string, number>; count: number }>()
  for (const rule of rules) {
    const value = rule.settings?.foreground
    if (!value) continue
    const color = toOklch(value)
    if (!color) continue
    const scope = Array.isArray(rule.scope) ? rule.scope.join(',') : (rule.scope ?? '')
    const named = scope.split(',').filter((part) => part.trim()).length
    // A rule naming no scope paints everything the others leave, which is most
    // of a snippet: it counts for more than any one of them.
    const reach = named || unscoped
    // Grey and near-grey keep to themselves rather than joining whichever hue
    // they lean toward: the color most code is written in is often one of them,
    // and it is not a pale version of the accent beside it.
    const key = color.c < neutral ? 'neutral' : String(Math.floor((color.h ?? 0) / 30))
    const found = groups.get(key) ?? { colors: new Map<string, number>(), count: 0 }
    found.count += reach
    // Each color's own total, so the one shown is the one the theme paints most
    // of the group in rather than whichever rule happens to name most scopes.
    found.colors.set(value, (found.colors.get(value) ?? 0) + reach)
    groups.set(key, found)
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, wanted)
    .map((group) => {
      // The color itself rather than the group's average, which is a color the
      // theme never paints: a group of blues averages to a duller blue than any
      // of them.
      const [best] = [...group.colors].sort((a, b) => b[1] - a[1])
      return formatHex(toOklch(best?.[0] ?? '#888888') ?? { c: 0, h: 0, l: 0.5, mode: 'oklch' })
    })
}
