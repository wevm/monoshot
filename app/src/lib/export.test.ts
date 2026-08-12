import { fit } from './export.js'

// `fit` reads the pointer type to pick an area cap, which node does not offer.
// A fine pointer, so these sizes are measured against the desktop cap.
globalThis.matchMedia = ((query: string) => ({ matches: false, media: query })) as never

describe('fit', () => {
  test('meets a scale the artwork has room for', () => {
    expect(fit({ height: 400, width: 800 }, { scale: 4, type: 'png' })).toMatchInlineSnapshot(`4`)
  })

  test('caps a scale the artwork has no room for', () => {
    expect(fit({ height: 4000, width: 4000 }, { scale: 6, type: 'png' })).toMatchInlineSnapshot(
      `2.850438562747845`,
    )
  })

  test('shrinks artwork already over a limit at its own size', () => {
    // Taller than a canvas can be, so 1x is already a blank capture and the
    // only scale that rasterizes is below it.
    expect(fit({ height: 20_000, width: 1000 }, { scale: 2, type: 'png' })).toMatchInlineSnapshot(
      `0.8192`,
    )
  })

  test('preserves scale when dimensions are unavailable', () => {
    expect(fit({ height: 0, width: 0 }, { scale: 4, type: 'png' })).toMatchInlineSnapshot(`4`)
  })

  test('leaves an svg at the scale it asked for', () => {
    // The same artwork a png would be shrunk for: an svg is never rasterized,
    // so a cap it cannot hit must not cost it intrinsic size.
    expect(fit({ height: 20_000, width: 1000 }, { scale: 2, type: 'svg' })).toMatchInlineSnapshot(
      `2`,
    )
  })
})
