import * as Codec from './Codec.js'

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
})

describe('deserialize', () => {
  test('returns every field, none of them optional', () => {
    expectTypeOf(Codec.deserialize('')).toEqualTypeOf<Codec.State>()
    expectTypeOf<Codec.State>().toEqualTypeOf<{
      background: string
      code: string
      lang: string
      padding: number
      radius: number
      theme: string
      title: string
      titleBar: boolean
      width: number
    }>()
  })
})
