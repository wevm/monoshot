import * as Wallpapers from './wallpapers.js'

test('offers Golden Gate Dark first', () => {
  expect(Wallpapers.list[0]).toMatchObject({ id: 'golden-gate-dark' })
})

test('extracts four dominant image colors', () => {
  const colors = [
    [16, 32, 48],
    [64, 96, 128],
    [176, 64, 96],
    [224, 192, 80],
  ]
  const pixels = new Uint8ClampedArray(
    colors.flatMap((color, index) =>
      Array.from({ length: 5 - index }, () => [...color, 255]).flat(),
    ),
  )
  expect(Wallpapers.dominant(pixels)).toEqual(['#102030', '#406080', '#b04060', '#e0c050'])
})
