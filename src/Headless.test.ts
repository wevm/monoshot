import * as fs from 'node:fs'

import * as Frame from './Frame.js'
import * as Headless from './Headless.js'

/**
 * Rendering needs a real browser, which a CI runner does not have. The test
 * reports that it skipped rather than passing on nothing.
 */
const chrome = [
  process.env['PUPPETEER_EXECUTABLE_PATH'],
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((path) => path && fs.existsSync(path))

describe('fit', () => {
  test('keeps a scale the browser can rasterize', () => {
    expect({
      asked: Headless.fit({ height: 500, width: 800 }, 4),
      capped: Headless.fit({ height: 500, width: 8000 }, 6),
      unknown: Headless.fit(null, 3),
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
      tall: Headless.fit({ height: 40_000, width: 600 }, 2),
      wide: Headless.fit({ height: 500, width: 20_000 }, 2),
    }).toMatchInlineSnapshot(`
      {
        "tall": 0.4096,
        "wide": 0.8192,
      }
    `)
  })
})

describe('create', () => {
  test.skipIf(!chrome)('stays usable after being disposed', { timeout: 120_000 }, async () => {
    const renderer = Headless.create()
    await renderer.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
    await renderer.dispose()
    const png = await renderer.render({ code: 'const b = 2', lang: 'ts', theme: 'vitesse-dark' })
    await renderer.dispose()
    expect(png.length > 5000).toMatchInlineSnapshot(`true`)
  })

  test.skipIf(!chrome)(
    'renders through a frame the caller owns',
    { timeout: 120_000 },
    async () => {
      const frame = Frame.create()
      const renderer = Headless.create({ frame })
      const png = await renderer.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
      await renderer.dispose()
      // The renderer highlighted through the frame it was handed, and the frame
      // outlives it.
      const result = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
      await frame.dispose()
      expect({ highlighted: result.html.includes('shiki'), sized: png.length > 5000 })
        .toMatchInlineSnapshot(`
      {
        "highlighted": true,
        "sized": true,
      }
    `)
    },
  )
})

describe('render', () => {
  test.skipIf(!chrome)('screenshots a frame through a browser', { timeout: 90_000 }, async () => {
    const png = await Headless.render({
      code: 'const a: number = 1\n',
      lang: 'tsx',
      theme: 'vitesse-dark',
      title: 'headless.ts',
    })
    // The PNG signature, so a blank or truncated capture is not mistaken for
    // a rendered one.
    expect({ png: png.slice(0, 4), sized: png.length > 5000 }).toMatchInlineSnapshot(`
      {
        "png": {
          "data": [
            137,
            80,
            78,
            71,
          ],
          "type": "Buffer",
        },
        "sized": true,
      }
    `)
  })

  test('says what is missing when there is no browser to use', async () => {
    await expect(
      Headless.render({
        code: 'const a = 1',
        lang: 'ts',
        theme: 'vitesse-dark',
        executable: '/nope',
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Headless.ChromeError: Could not start Chrome. Install it, or point \`executable\` at a binary.]`,
    )
  })
})
