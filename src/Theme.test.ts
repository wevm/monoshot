import { parse } from 'culori'
import { bundledThemes } from 'shiki'

import * as Frame from './Frame.js'
import * as Theme from './Theme.js'

const frame = Frame.create()

/** The themes this package makes rather than takes from shiki. */
const composed = [
  'golden-gate-dark',
  'golden-gate-light',
  'mountain-lion',
  'panther',
  'sequoia-dark',
  'sequoia-light',
  'snow-leopard',
  'tahoe-dark',
  'tahoe-light',
]

describe('list', () => {
  test('offers a chosen few of what shiki bundles, then the ones made here', () => {
    // The picker walks them in this order: what shiki brought, then what was
    // composed from the wallpapers.
    expect(Theme.list().map((entry) => entry.name)).toMatchInlineSnapshot(`
      [
        "aurora-x",
        "dracula",
        "github-dark",
        "github-dark-default",
        "github-light",
        "gruvbox-light-soft",
        "horizon",
        "horizon-bright",
        "houston",
        "nord",
        "poimandres",
        "rose-pine",
        "tokyo-night",
        "vitesse-dark",
        "vitesse-light",
        "golden-gate-dark",
        "golden-gate-light",
        "mountain-lion",
        "panther",
        "sequoia-dark",
        "sequoia-light",
        "snow-leopard",
        "tahoe-dark",
        "tahoe-light",
      ]
    `)
    const bundled = Theme.list().filter((entry) => !composed.includes(entry.name))
    expect(bundled.every((entry) => Object.keys(bundledThemes).includes(entry.name))).toBe(true)
    // Everything else is one this package composes, and the renderer loads it
    // by the same name a picker offers.
    expect(Theme.composed.map((theme) => theme.name)).toEqual(composed)
  })

  test('groups into light and dark', () => {
    const types = new Set(Theme.list().map((entry) => entry.type))
    expect([...types].sort()).toMatchInlineSnapshot(`
      [
        "dark",
        "light",
      ]
    `)
  })
})

describe('info', () => {
  test('returns metadata for a bundled theme', () => {
    expect(Theme.info('vitesse-dark')).toMatchInlineSnapshot(`
      {
        "displayName": "Vitesse Dark",
        "name": "vitesse-dark",
        "type": "dark",
      }
    `)
  })

  test('returns undefined for an unknown theme', () => {
    expect(Theme.info('not-a-theme')).toBeUndefined()
  })
})

describe('list', () => {
  test('hands out a frozen array', () => {
    expect(Object.isFrozen(Theme.list())).toBe(true)
  })
})

describe('derive', () => {
  test('falls back when a theme color is present but unparseable', () => {
    const result = Theme.derive({
      colors: { 'editor.background': 'not-a-color', 'editor.foreground': '' },
      type: 'dark',
    } as never)
    expect(parse(result.window.background)).toBeDefined()
    expect(parse(result.window.foreground)).toBeDefined()
  })

  test.for(Theme.list().map((entry) => entry.name))(
    'emits parseable, separated colors for %s',
    async (name) => {
      const rendered = await frame.render({ code: 'const a = 1', lang: 'ts', theme: name })
      const result = Theme.derive(rendered.theme)
      const colors = [
        result.backdrop.from,
        result.backdrop.to,
        result.window.background,
        result.window.border,
        result.window.title,
      ]
      for (const color of colors) {
        expect(color, `${name}: ${color}`).not.toContain('NaN')
        expect(parse(color), `${name}: ${color}`).toBeDefined()
      }
      // The window has to read as a distinct surface against its backdrop.
      const backdrop = lightness(result.backdrop.from)
      const window = lightness(result.window.background)
      expect(
        Math.abs(backdrop - window),
        `${name}: backdrop ${backdrop} vs window ${window}`,
      ).toBeGreaterThan(0.04)
    },
  )

  test('keeps achromatic themes neutral instead of emitting NaN hues', async () => {
    // Not a theme the picker offers, which a palette is derived from all the
    // same: what is drawn is whatever shiki resolved.
    const rendered = await frame.render({ code: 'a', lang: 'ts', theme: 'min-light' })
    const result = Theme.derive(rendered.theme)
    expect(result.backdrop.from).not.toContain('NaN')
    expect(result.type).toBe('light')
  })

  test('falls back when the theme carries no usable colors', () => {
    const result = Theme.derive({ bg: '', fg: '', name: 'empty', settings: [], type: 'dark' })
    expect(result).toMatchInlineSnapshot(`
      {
        "backdrop": {
          "angle": 140,
          "from": "oklch(0.3330423087221773 0 0)",
          "to": "oklch(0.27304230872217733 0 0)",
        },
        "page": {
          "background": "oklch(0.23304230872217735 0 0)",
          "foreground": "oklch(0.93 0 0)",
        },
        "type": "dark",
        "window": {
          "background": "#101010",
          "border": "oklch(0.26580986589144595 0 0)",
          "foreground": "#ededed",
          "title": "oklch(0.5982269457479918 0 0)",
        },
      }
    `)
  })
})

describe('compose', () => {
  const colors = ['oklch(0.38 0.06 244)', 'oklch(0.55 0.04 236)', 'oklch(0.86 0.04 94)']

  test('writes every color as hex, which is what reads a theme', () => {
    const theme = Theme.compose({ colors, displayName: 'Tahoe', name: 'tahoe', type: 'dark' })
    const written = [
      theme.bg,
      theme.fg,
      ...(theme.settings ?? []).flatMap((rule) => [
        rule.settings.background,
        rule.settings.foreground,
      ]),
    ].filter((color) => color !== undefined)
    expect(written.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true)
  })

  test('gives every part of a snippet a color of its own', () => {
    const theme = Theme.compose({ colors, displayName: 'Tahoe', name: 'tahoe', type: 'dark' })
    const scoped = (theme.settings ?? []).filter((rule) => rule.scope)
    const written = new Set(scoped.map((rule) => rule.settings.foreground))
    expect(scoped.length).toBeGreaterThan(6)
    expect(written.size).toBeGreaterThan(5)
  })

  test('holds a dark theme apart from the background it is read on', () => {
    const theme = Theme.compose({ colors, displayName: 'Tahoe', name: 'tahoe', type: 'dark' })
    const background = lightness(theme.bg as string)
    const tokens = (theme.settings ?? [])
      .filter((rule) => rule.scope)
      .map((rule) => lightness(rule.settings.foreground as string))
    expect(Math.min(...tokens) - background).toBeGreaterThan(0.2)
  })

  test('takes a light theme the other way, off a light background', () => {
    const theme = Theme.compose({ colors, displayName: 'Tahoe', name: 'tahoe', type: 'light' })
    const background = lightness(theme.bg as string)
    const tokens = (theme.settings ?? [])
      .filter((rule) => rule.scope)
      .map((rule) => lightness(rule.settings.foreground as string))
    expect(background - Math.max(...tokens)).toBeGreaterThan(0.2)
  })

  test('fills the roles a picture is too plain to fill itself', () => {
    const theme = Theme.compose({
      colors: ['oklch(0.5 0.05 250)'],
      displayName: 'One',
      name: 'one',
      type: 'dark',
    })
    const written = new Set(
      (theme.settings ?? []).filter((rule) => rule.scope).map((rule) => rule.settings.foreground),
    )
    expect(written.size).toBeGreaterThan(3)
  })
})

function lightness(color: string): number {
  const match = /oklch\(([\d.]+)/.exec(color)
  if (match?.[1]) return Number(match[1])
  // Hex canvases come straight from the theme; approximate their lightness.
  const hex = color.replace('#', '')
  const size = hex.length === 3 ? 1 : 2
  const channel = (index: number) =>
    Number.parseInt(hex.slice(index * size, index * size + size).repeat(3 - size), 16) / 255
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}
