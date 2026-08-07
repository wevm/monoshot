import * as Frame from '../Frame.js'

const frame = Frame.create({ langs: ['tsx'], themes: ['vitesse-dark'] })

const options = {
  background: 'default',
  code: "const a = 'x'\n",
  lang: 'tsx',
  lineNumbers: false,
  padding: 64,
  radius: 12,
  theme: 'vitesse-dark',
  title: 'sample.ts',
  titleBar: true,
  width: 640,
} as const

describe('build', () => {
  test('carries the frame, the code, and nothing that needs the network', async () => {
    const document = await frame.toDocument(options)
    expect({
      // A headless browser gets one document and must not reach for anything
      // else: a request that fails would silently change the image.
      requests: /<(script|link|img)\b/.test(document),
      hasChrome: document.includes('class="title-bar"'),
      hasCode: document.includes('class="shiki'),
      title: /<span class="title">([^<]*)<\/span>/.exec(document)?.[1],
    }).toMatchInlineSnapshot(`
      {
        "hasChrome": true,
        "hasCode": true,
        "requests": false,
        "title": "sample.ts",
      }
    `)
  })

  test('escapes a title rather than letting it reach the markup', async () => {
    const document = await frame.toDocument({ ...options, title: '<script>alert(1)</script>' })
    expect(/<span class="title">([^<]*)<\/span>/.exec(document)?.[1]).toMatchInlineSnapshot(
      `"&lt;script&gt;alert(1)&lt;/script&gt;"`,
    )
  })

  test('falls back to a placeholder when the window is untitled', async () => {
    const document = await frame.toDocument({ ...options, title: '' })
    expect(/<span class="title">([^<]*)<\/span>/.exec(document)?.[1]).toMatchInlineSnapshot(
      `"untitled"`,
    )
  })

  test('drops the title bar when it is turned off', async () => {
    const document = await frame.toDocument({ ...options, titleBar: false })
    // The markup, not the stylesheet: the rule is always there.
    expect(document.includes('<div class="title-bar">')).toMatchInlineSnapshot(`false`)
  })

  test('paints the backdrop the background asks for', async () => {
    const shown = async (background: string) => {
      const document = await frame.toDocument({ ...options, background })
      return /\.canvas \{\n  background: ([^;]+);/.exec(document)?.[1]
    }
    expect({
      custom: await shown('#101014'),
      default: await shown('default'),
      none: await shown('none'),
    }).toMatchInlineSnapshot(`
      {
        "custom": "#101014",
        "default": "linear-gradient(140deg, oklch(0.34220370283599866 0.09 37.89172016407201), oklch(0.28220370283599866 0.09 87.89172016407201))",
        "none": "transparent",
      }
    `)
  })

  test('only styles the gutter when line numbers are asked for', async () => {
    const off = await frame.toDocument(options)
    const on = await frame.toDocument({ ...options, lineNumbers: true })
    expect({
      off: off.includes('.line::before'),
      on: on.includes('.line::before'),
    }).toMatchInlineSnapshot(`
      {
        "off": false,
        "on": true,
      }
    `)
  })

  test('embeds a font rather than linking it', async () => {
    const document = await frame.toDocument({
      ...options,
      fonts: [{ family: 'Geist Mono', source: 'data:font/woff2;base64,AAAA', weight: '100 900' }],
    })
    expect(/@font-face \{[^}]*\}/.exec(document)?.[0]).toMatchInlineSnapshot(`
      "@font-face {
        font-family: 'Geist Mono';
        font-style: normal;
        font-weight: 100 900;
        src: url(data:font/woff2;base64,AAAA);
      }"
    `)
  })
})
