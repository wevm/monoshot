import * as Codec from './Codec.js'
import type * as Theme from './Theme.js'

describe('serialize', () => {
  test('takes any subset of the state', () => {
    expectTypeOf<Codec.serialize.Options>().toEqualTypeOf<Partial<Codec.State>>()
    expectTypeOf(Codec.serialize({})).toEqualTypeOf<string>()
    expectTypeOf(Codec.serialize({ code: 'const a = 1', width: 720 })).toEqualTypeOf<string>()
  })

  test('refuses a field the state does not carry, or carries as another type', () => {
    // @ts-expect-error a width is pixels, not a label.
    Codec.serialize({ width: 'wide' })
    // @ts-expect-error the state has no such field.
    Codec.serialize({ nope: true })
  })

  test('takes a theme by name, and no name that is not offered', () => {
    Codec.serialize({ theme: 'vitesse-dark' })
    Codec.serialize({ theme: 'tahoe-dark' })
    // @ts-expect-error shiki bundles it, but the picker does not offer it.
    Codec.serialize({ theme: 'andromeeda' })
  })
})

describe('deserialize', () => {
  test('returns every setting, with width absent for an automatically sized frame', () => {
    expectTypeOf(Codec.deserialize('')).toEqualTypeOf<Codec.State>()
    expectTypeOf<Codec.State>().toEqualTypeOf<{
      background: string
      code: string
      lang: string
      padding: number
      radius: number
      syntax: 'auto' | Theme.Name
      theme: Theme.Name
      title: string
      titleBar: boolean
      types: boolean
      width?: number | undefined
    }>()
  })
})
