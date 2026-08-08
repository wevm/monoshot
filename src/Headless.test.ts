import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

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

describe('create', () => {
  test.skipIf(!chrome)('stays usable after being disposed', { timeout: 120_000 }, async () => {
    const renderer = Headless.create()
    await renderer.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
    await renderer.dispose()
    const png = await renderer.render({ code: 'const b = 2', lang: 'ts', theme: 'vitesse-dark' })
    await renderer.dispose()
    expect(png.length > 5000).toMatchInlineSnapshot(`true`)
  })

  test.skipIf(!chrome)('recovers from a browser that died', { timeout: 120_000 }, async () => {
    // `exec` keeps the pid the wrapper recorded, so the kill lands on the
    // browser this renderer launched rather than any other Chrome running.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'monoshot-'))
    const pidFile = path.join(directory, 'pid')
    const executable = path.join(directory, 'chrome')
    fs.writeFileSync(
      executable,
      `#!/bin/sh\necho $$ > ${JSON.stringify(pidFile)}\nexec ${JSON.stringify(chrome)} "$@"\n`,
      { mode: 0o755 },
    )

    const renderer = Headless.create({ executable })
    await renderer.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
    process.kill(Number(fs.readFileSync(pidFile, 'utf8').trim()), 'SIGKILL')
    // Nothing here observes the renderer noticing, so give the closed pipe a
    // turn of the loop to reach it.
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // A renderer holding the dead browser would fail here and never recover.
    const png = await renderer.render({ code: 'const b = 2', lang: 'ts', theme: 'vitesse-dark' })
    await renderer.dispose()
    fs.rmSync(directory, { force: true, recursive: true })
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
