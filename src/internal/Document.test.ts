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

  test('leaves an unbreakable token somewhere to wrap', async () => {
    const document = await frame.toDocument(options)
    // Without a break opportunity inside the token, a long identifier or URL
    // runs past the window, which clips it out of the image.
    expect(/\.shiki, \.shiki code \{[\s\S]*?\n\}/.exec(document)?.[0]).toMatchInlineSnapshot(`
      ".shiki, .shiki code {
        background: transparent !important;
        font-family: var(--code-font-family);
        font-size: var(--code-font-size);
        font-variant-ligatures: none;
        line-height: var(--code-line-height);
        /* Whitespace is the only break pre-wrap offers, and the window clips the
           rest: a long identifier or URL would run out of the image. */
        overflow-wrap: anywhere;
        tab-size: var(--code-tab-size);
        white-space: pre-wrap;
      }"
    `)
  })

  test('gives the window the depth the preview draws', async () => {
    const shadow = async (theme: 'vitesse-dark' | 'vitesse-light') => {
      const document = await frame.toDocument({ ...options, theme })
      return /--window-shadow: ([^;]+);/.exec(document)?.[1]
    }
    expect({
      dark: await shadow('vitesse-dark'),
      light: await shadow('vitesse-light'),
    }).toMatchInlineSnapshot(`
      {
        "dark": "0 24px 48px -12px #00000059",
        "light": "0 24px 48px -12px #00000026",
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
        "default": "linear-gradient(140deg, oklch(0.34220370283599866 0.09789893959403556 351.04021560887355), oklch(0.28220370283599866 0.09789893959403556 41.04021560887355))",
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

  test('numbers past a digit the marks would have hidden', async () => {
    // A marked line is still a line: counting bare `class="line"` would drop
    // it, and a ten-line snippet would allocate a single digit.
    const lines = Array.from({ length: 10 }, (_, index) => `const a${index} = ${index}`)
    lines[0] += ' // [!code hl]'
    const document = await frame.toDocument({
      ...options,
      code: `${lines.join('\n')}\n`,
      lineNumbers: true,
    })
    expect(document).toContain('data-line="10"')
    expect(document).toContain('width: 2ch')
  })

  test('keeps a numbered line beside its diff marker', async () => {
    const document = await frame.toDocument({
      ...options,
      code: "const a = 'x' // [!code --]\nconst a = 'y' // [!code ++]\n",
      lineNumbers: true,
    })
    // The marker takes the pseudo-element the number does not, so a diff line
    // draws both.
    expect(document).toContain('.shiki .line.diff::after')
    expect(document).not.toContain('.shiki .line.diff::before')
  })

  test('draws a tag as prose without a glyph repeating it', async () => {
    const document = await frame.toDocument({
      ...options,
      code: '// @log: looked at\nconst a = 1\n',
      twoslash: true,
    })
    expect(document).toContain('twoslash-tag-log-line')
    expect(document).toContain(`.twoslash-tag-icon {
  /* The tag reads as prose in its own hue, which says what it is without a
     glyph repeating it. */
  display: none;
}`)
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

  test('asks for the families it embedded, not just the default', async () => {
    const stack = async (fonts?: readonly { family: string; source: string }[]) => {
      const document = await frame.toDocument({ ...options, ...(fonts ? { fonts } : {}) })
      return /--code-font-family: ([^;]+);/.exec(document)?.[1]
    }
    expect({
      embedded: await stack([{ family: 'Geist Mono', source: 'data:font/woff2;base64,AAAA' }]),
      none: await stack(),
      // The default is already in the stack, so embedding it adds no duplicate.
      redundant: await stack([
        { family: 'Geist Mono Variable', source: 'data:font/woff2;base64,AAAA' },
      ]),
    }).toMatchInlineSnapshot(`
      {
        "embedded": "'Geist Mono', 'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
        "none": "'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
        "redundant": "'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
      }
    `)
  })

  test('refuses a background that would leave the stylesheet or fetch a resource', async () => {
    const rejected = async (background: string) =>
      await frame
        .toDocument({ ...options, background })
        .then(() => 'accepted')
        .catch((error: Error) => `${error.name}: ${error.message}`)
    expect({
      escape: await rejected('red</style><script>alert(1)</script><style>'),
      // `\` would spell `url(` past the check, so the escape itself is refused.
      escaped: await rejected('\\75 rl(https://example.com/a.png)'),
      imageSet: await rejected('image-set(a.png 1x)'),
      remote: await rejected('url(https://example.com/a.png)'),
      // A color or gradient is still an ordinary background.
      safe: await rejected('linear-gradient(140deg, #101014, rgb(0 0 0 / 50%))'),
    }).toMatchInlineSnapshot(`
      {
        "escape": "Document.UnsafeValueError: \`background\` is not a safe standalone CSS value: red</style><script>alert(1)</script><style>",
        "escaped": "Document.UnsafeValueError: \`background\` is not a safe standalone CSS value: \\75 rl(https://example.com/a.png)",
        "imageSet": "Document.UnsafeValueError: \`background\` is not a safe standalone CSS value: image-set(a.png 1x)",
        "remote": "Document.UnsafeValueError: \`background\` is not a safe standalone CSS value: url(https://example.com/a.png)",
        "safe": "accepted",
      }
    `)
  })

  test('refuses a font that would leave the stylesheet or fetch a resource', async () => {
    const rejected = async (font: { family: string; source: string }) =>
      await frame
        .toDocument({ ...options, fonts: [font] })
        .then(() => 'accepted')
        .catch((error: Error) => `${error.name}: ${error.message}`)
    expect({
      family: await rejected({
        family: "a'; } </style><script>alert(1)</script><style> .x {",
        source: 'data:font/woff2;base64,AAAA',
      }),
      remote: await rejected({ family: 'Geist Mono', source: 'https://example.com/a.woff2' }),
    }).toMatchInlineSnapshot(`
      {
        "family": "Document.UnsafeValueError: \`fonts[].family\` is not a safe standalone CSS value: a'; } </style><script>alert(1)</script><style> .x {",
        "remote": "Document.UnsafeValueError: \`fonts[].source\` is not a safe standalone CSS value: https://example.com/a.woff2",
      }
    `)
  })
})
