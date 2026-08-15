import * as Themes from './themes.js'

describe('swatch', () => {
  test('places syntax foregrounds on the code background', () => {
    expect(Themes.swatch('dracula')).toMatchObject({
      background: '#282A36',
      colors: ['#ff79c6', '#8be9fd', '#50fa7b'],
    })
  })

  test('keeps three foregrounds after removing pale neutrals', () => {
    expect(Themes.swatch('tahoe-dark').colors).toEqual(['#adaeff', '#99b5ff', '#96989f'])
  })
})
