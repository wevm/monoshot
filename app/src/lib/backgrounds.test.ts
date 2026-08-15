import { Theme } from 'monoshot'

import * as Backgrounds from './backgrounds.js'
import * as Wallpapers from './wallpapers.js'

describe('syntax', () => {
  test('pairs every preset backdrop with an offered syntax theme', () => {
    const backgrounds = [
      ...Wallpapers.list.map((entry) => Wallpapers.background(entry.id)),
      ...Backgrounds.gradients.map((entry) => Backgrounds.value(entry.colors)),
      ...Backgrounds.colors,
      'none',
      'image',
    ]
    expect(
      backgrounds.every((background) =>
        Theme.info(Backgrounds.syntax(background, ['#102030', '#406080', '#90a0b0', '#d0e0f0'])),
      ),
    ).toBe(true)
  })

  test('uses the composed syntax theme for every wallpaper', () => {
    expect(
      Wallpapers.list.map((entry) => Backgrounds.syntax(Wallpapers.background(entry.id))),
    ).toEqual(Wallpapers.list.map((entry) => entry.id))
  })
})
