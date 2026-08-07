import * as fs from 'node:fs'

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
