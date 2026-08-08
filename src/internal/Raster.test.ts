import * as Raster from './Raster.js'

describe('fit', () => {
  test('keeps a scale the browser can rasterize', () => {
    expect({
      asked: Raster.fit({ height: 500, width: 800 }, 4),
      capped: Raster.fit({ height: 500, width: 8000 }, 6),
      unknown: Raster.fit(null, 3),
    }).toMatchInlineSnapshot(`
      {
        "asked": 4,
        "capped": 2.048,
        "unknown": 3,
      }
    `)
  })

  test('shrinks a frame that is already past the raster limit', () => {
    // A floor of 1 here would leave the image over the limit and blank.
    expect({
      tall: Raster.fit({ height: 40_000, width: 600 }, 2),
      wide: Raster.fit({ height: 500, width: 20_000 }, 2),
    }).toMatchInlineSnapshot(`
      {
        "tall": 0.4096,
        "wide": 0.8192,
      }
    `)
  })
})
