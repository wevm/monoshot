import * as Frame from './Frame.js'
import * as Theme from './Theme.js'

describe('create', () => {
  test('takes a bundled theme and one composed here', () => {
    const frame = Frame.create()
    expectTypeOf(frame.render).toBeCallableWith({ code: 'a', lang: 'ts', theme: 'vitesse-dark' })
    expectTypeOf(frame.render).toBeCallableWith({ code: 'a', lang: 'ts', theme: 'tahoe-dark' })
  })

  test('refuses a theme it has never heard of', () => {
    const frame = Frame.create()
    // @ts-expect-error -- a misspelled theme is a type error rather than a
    // rejected load.
    frame.render({ code: 'a', lang: 'ts', theme: 'vitesse-drak' })
  })

  test('takes the name of a theme it was built with', () => {
    const theme = Theme.compose({
      colors: ['#4f9cf0'],
      displayName: 'Mine',
      name: 'mine',
      type: 'dark',
    })
    const frame = Frame.create({ themes: [theme, 'nord'] })
    expectTypeOf(frame.render).toBeCallableWith({ code: 'a', lang: 'ts', theme: 'mine' })
    expectTypeOf(frame.load).toBeCallableWith({ lang: 'ts', theme: 'mine' })
    expectTypeOf(frame.tokens).toBeCallableWith({ code: 'a', lang: 'ts', theme: 'mine' })
  })

  test('still refuses an unknown name on a renderer built with themes', () => {
    const frame = Frame.create({ themes: ['nord'] })
    // @ts-expect-error -- preloading a theme does not open the door to every
    // string.
    frame.render({ code: 'a', lang: 'ts', theme: 'not-a-theme' })
  })
})

describe('Name', () => {
  test('spans what shiki bundles and what this package composes', () => {
    expectTypeOf<'nord'>().toExtend<Frame.Name>()
    expectTypeOf<Theme.Composed>().toExtend<Frame.Name>()
    expectTypeOf<'nope'>().not.toExtend<Frame.Name>()
  })
})
