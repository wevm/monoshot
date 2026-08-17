import { Theme } from 'monoshot'

import * as Themes from './themes.js'
import * as Wallpapers from './wallpapers.js'

export const gradients = [
  { colors: ['#3F37C9', '#8C87DF'], name: 'Indigo', theme: 'tokyo-night' },
  { colors: ['#0F4C81', '#4FC3F7'], name: 'Ocean', theme: 'houston' },
  { colors: ['#0F766E', '#5EEAD4'], name: 'Lagoon', theme: 'poimandres' },
  { colors: ['#166534', '#A3E635'], name: 'Forest', theme: 'nord' },
  { colors: ['#7C2D12', '#FB923C'], name: 'Ember', theme: 'horizon' },
  { colors: ['#9D174D', '#F472B6'], name: 'Rose', theme: 'rose-pine' },
  { colors: ['#581C87', '#C084FC'], name: 'Violet', theme: 'dracula' },
  { colors: ['#334155', '#94A3B8'], name: 'Slate', theme: 'github-dark-default' },
] as const satisfies readonly Gradient[]

export const colors = [
  '#000000',
  '#1c1c1e',
  '#8e8e93',
  '#ffffff',
  '#8e3a34',
  '#d64541',
  '#e8833a',
  '#e8a33a',
  '#f2d04b',
  '#4caf6a',
  '#3aab8f',
  '#3b82d6',
  '#4258d6',
  '#a855c7',
  '#d6478f',
] as const

const colorThemes: Record<(typeof colors)[number], Theme.Name> = {
  '#000000': 'github-dark',
  '#1c1c1e': 'vitesse-dark',
  '#8e8e93': 'nord',
  '#ffffff': 'github-light',
  '#8e3a34': 'vitesse-dark',
  '#d64541': 'horizon',
  '#e8833a': 'horizon-bright',
  '#e8a33a': 'gruvbox-light-soft',
  '#f2d04b': 'gruvbox-light-soft',
  '#4caf6a': 'nord',
  '#3aab8f': 'poimandres',
  '#3b82d6': 'github-dark-default',
  '#4258d6': 'tokyo-night',
  '#a855c7': 'dracula',
  '#d6478f': 'aurora-x',
}

type Gradient = {
  colors: readonly [string, string]
  name: string
  theme: Theme.Name
}

/** Syntax theme paired with a backdrop while Syntax is set to Auto. */
export function syntax(background: string, palette: readonly string[] = []): Theme.Name {
  const wallpaper = Wallpapers.at(background)
  if (wallpaper && Theme.info(wallpaper.id)) return wallpaper.id as Theme.Name
  const preset = gradients.find(
    (entry) => background.toLowerCase() === value(entry.colors).toLowerCase(),
  )
  if (preset) return preset.theme
  const solid = colors.find((entry) => entry.toLowerCase() === background.toLowerCase())
  if (solid) return colorThemes[solid]
  const stops = gradient(background)
  if (stops) return nearest(stops)
  if (/^#[0-9a-f]{6}$/i.test(background)) return nearest([background])
  if (background === 'image' && palette.length) return nearest(palette)
  if (background === 'none') return 'vitesse-dark'
  return 'golden-gate-dark'
}

export function value(colors: readonly [string, string]) {
  return `gradient:${colors[0]}:${colors[1]}`
}

/** The two stops a `gradient:` background names, or `undefined` for any other. */
export function gradient(background: string): [string, string] | undefined {
  const match = encoded.exec(background)
  return match?.[1] && match[2] ? [match[1], match[2]] : undefined
}

const encoded = /^gradient:(#[0-9a-f]{6}):(#[0-9a-f]{6})$/i

function nearest(palette: readonly string[]): Theme.Name {
  return Theme.list().reduce(
    (best, theme) => {
      const swatch = Themes.swatch(theme.name).colors
      const score = palette.reduce(
        (sum, source) => sum + Math.min(...swatch.map((candidate) => distance(source, candidate))),
        0,
      )
      return score < best.score ? { name: theme.name, score } : best
    },
    { name: 'vitesse-dark' as Theme.Name, score: Number.POSITIVE_INFINITY },
  ).name
}

function distance(left: string, right: string) {
  const a = rgb(left)
  const b = rgb(right)
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}
