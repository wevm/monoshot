import { parse } from 'culori'
import { bundledThemes } from 'shiki'
import type { BundledTheme } from 'shiki'

import * as Frame from './Frame.js'
import * as Theme from './Theme.js'

describe('list', () => {
  test('covers every theme shiki bundles', () => {
    const bundled = Object.keys(bundledThemes).sort()
    expect(
      Theme.list()
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(bundled)
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

describe('derive', () => {
  test.for(Object.keys(bundledThemes) as BundledTheme[])(
    'emits parseable colors for %s',
    async (name) => {
      const highlighter = await Frame.load({ lang: 'ts', theme: name })
      const result = Theme.derive(highlighter.getTheme(name))
      const colors = [
        result.backdrop.from,
        result.backdrop.to,
        result.window.background,
        result.window.border,
        result.window.foreground,
        result.window.title,
      ]
      for (const color of colors) {
        expect(color, `${name}: ${color}`).not.toContain('NaN')
        expect(parse(color), `${name}: ${color}`).toBeDefined()
      }
    },
  )

  test('keeps achromatic themes neutral instead of emitting NaN hues', async () => {
    const highlighter = await Frame.load({ lang: 'ts', theme: 'min-light' })
    const result = Theme.derive(highlighter.getTheme('min-light'))
    expect(result.backdrop.from).not.toContain('NaN')
    expect(result.type).toBe('light')
  })
})
