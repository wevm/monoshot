import * as Frame from './Frame.js'

describe('create', () => {
  test('serves several themes from one instance', async () => {
    const frame = Frame.create()
    await Promise.all([
      frame.load({ lang: 'ts', theme: 'vitesse-dark' }),
      frame.load({ lang: 'tsx', theme: 'nord' }),
    ])
    const [first, second] = await Promise.all([
      frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' }),
      frame.render({ code: 'const a = 1', lang: 'tsx', theme: 'nord' }),
    ])
    expect(first.theme.name).toBe('vitesse-dark')
    expect(second.theme.name).toBe('nord')
  })

  test('preloads the resources it is given', async () => {
    const frame = Frame.create({ langs: ['ts'], themes: ['nord'] })
    const result = await frame.render({ code: 'a', lang: 'ts', theme: 'nord' })
    expect(result.theme.name).toBe('nord')
  })

  test('hands out operations that carry their own renderer', async () => {
    const { toDocument } = Frame.create()
    const document = await toDocument({
      background: 'none',
      code: 'const a = 1',
      lang: 'ts',
      lineNumbers: false,
      padding: 32,
      radius: 12,
      theme: 'nord',
      title: 'a.ts',
      titleBar: true,
      width: 480,
    })
    expect(document.startsWith('<!doctype html>')).toMatchInlineSnapshot(`true`)
  })
})

describe('render', () => {
  test('marks every line with its number', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      code: 'const a = 1\nconst b = 2',
      lang: 'ts',
      theme: 'nord',
    })
    expect([...result.html.matchAll(/data-line="(\d+)"/g)].map(([, line]) => line))
      .toMatchInlineSnapshot(`
      [
        "1",
        "2",
      ]
    `)
  })

  test('returns the resolved theme alongside the markup', async () => {
    const frame = Frame.create()
    const result = await frame.render({ code: 'a', lang: 'ts', theme: 'nord' })
    expect(result.theme.name).toMatchInlineSnapshot(`"nord"`)
    expect(result.theme.type).toMatchInlineSnapshot(`"dark"`)
  })

  test('escapes markup in the source', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      code: 'const a = "<img src=x onerror=alert(1)>"',
      lang: 'ts',
      theme: 'nord',
    })
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('&#x3C;img')
  })

  test('rejects for a theme shiki does not bundle', async () => {
    const frame = Frame.create()
    await expect(
      frame.render({ code: 'a', lang: 'ts', theme: 'not-a-theme' as never }),
    ).rejects.toThrow()
  })
})

describe('create().dispose', () => {
  test('releases the highlighter and leaves the renderer usable', async () => {
    const frame = Frame.create()
    const before = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
    await frame.dispose()
    const after = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
    expect(after.html).toBe(before.html)
  })

  test('is a no-op before the first render', async () => {
    await expect(Frame.create().dispose()).resolves.toBeUndefined()
  })
})

describe('render', () => {
  test('returns a theme detached from the highlighter cache', async () => {
    const frame = Frame.create()
    const first = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'nord' })
    first.theme.bg = '#ff0000'
    const second = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'nord' })
    expect(second.theme.bg).not.toBe('#ff0000')
  })
})

describe('tokens', () => {
  test('returns one array of tokens per line', async () => {
    const frame = Frame.create()
    const result = await frame.tokens({
      code: 'const a = 1\nconst b = 2',
      lang: 'ts',
      theme: 'vitesse-dark',
    })
    expect(result.tokens.length).toBe(2)
    expect(result.tokens[0]?.map((token) => token.content).join('')).toBe('const a = 1')
    expect(result.tokens[0]?.every((token) => typeof token.color === 'string')).toBe(true)
  })

  test('offsets are absolute, so a line maps back to the document', async () => {
    const frame = Frame.create()
    const code = 'const a = 1\nconst b = 2'
    const result = await frame.tokens({ code, lang: 'ts', theme: 'vitesse-dark' })
    const second = result.tokens[1]?.[0]
    expect(
      code.slice(second?.offset ?? 0, (second?.offset ?? 0) + (second?.content.length ?? 0)),
    ).toBe(second?.content)
  })
})

describe('create', () => {
  test('matches grammars with the engine it is given', async () => {
    // The JavaScript engine is what a runtime that forbids compiling
    // WebAssembly has to use, and it must produce the same markup.
    const code = 'const greeting = "hello"\n'
    const standard = Frame.create()
    const javascript = Frame.create({ engine: 'javascript' })
    const [a, b] = await Promise.all([
      standard.render({ code, lang: 'ts', theme: 'vitesse-dark' }),
      javascript.render({ code, lang: 'ts', theme: 'vitesse-dark' }),
    ])
    await Promise.all([standard.dispose(), javascript.dispose()])
    expect(b.html).toBe(a.html)
  })
})

describe('render with notations', () => {
  test('marks the line a `[!code hl]` sits on, and takes the notation out', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      code: 'const a = 1 // [!code hl]\nconst b = 2\n',
      lang: 'ts',
      theme: 'vitesse-dark',
    })
    await frame.dispose()
    expect(result.html).toContain('has-highlighted')
    expect(result.html).not.toContain('[!code')
    expect([...result.html.matchAll(/class="line ?([a-z ]*)"/g)].map((match) => match[1]))
      .toMatchInlineSnapshot(`
      [
        "highlighted",
        "",
        "",
      ]
    `)
  })

  test('reads a diff, and a focus', async () => {
    const frame = Frame.create()
    const [diff, focus] = await Promise.all([
      frame.render({
        code: 'const a = 1 // [!code --]\nconst a = 2 // [!code ++]\n',
        lang: 'ts',
        theme: 'vitesse-dark',
      }),
      frame.render({
        code: 'const a = 1 // [!code focus]\nconst b = 2\n',
        lang: 'ts',
        theme: 'vitesse-dark',
      }),
    ])
    await frame.dispose()
    expect(diff.html).toContain('line diff remove')
    expect(diff.html).toContain('line diff add')
    expect(focus.html).toContain('line focused')
  })

  test('draws a line for each tag a snippet carries', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      // A tag attaches to the line after it, so each needs one of its own.
      code: [
        'const a = 1',
        '// @log: looked at',
        'const b = 2',
        '// @error: went wrong',
        'const c = 3',
        '// @warn: careful',
        'const d = 4',
        '// @annotate: note',
        'const e = 5',
        '',
      ].join('\n'),
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: true,
    })
    await frame.dispose()
    expect([...result.html.matchAll(/twoslash-tag-(\w+)-line/g)].map((match) => match[1]))
      .toMatchInlineSnapshot(`
      [
        "log",
        "error",
        "warn",
        "annotate",
      ]
    `)
    // The tag is prose about the code, not part of it.
    expect(result.html).not.toContain('@log:')
  })

  test('draws the marks only for a snippet that carries some', async () => {
    const frame = Frame.create()
    const settings = {
      background: 'default',
      lang: 'ts',
      lineNumbers: false,
      padding: 64,
      radius: 12,
      theme: 'vitesse-dark',
      title: '',
      titleBar: true,
      width: 640,
    } as const
    const [marked, plain] = await Promise.all([
      frame.toDocument({ ...settings, code: 'const a = 1 // [!code hl]\n' }),
      frame.toDocument({ ...settings, code: 'const a = 1\n' }),
    ])
    await frame.dispose()
    expect(marked).toContain('.line.highlighted')
    expect(plain).not.toContain('.line.highlighted')
  })
})

describe('render with twoslash', () => {
  const query = 'const greeting = "hello"\n//    ^?\n'

  test('draws the type a query asks for, in place of the query line', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      code: query,
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: true,
    })
    await frame.dispose()
    expect(result.html).toContain('twoslash-query-line')
    // The resolved type, not the literal notation. Read as text: the type is
    // highlighted, so it arrives split across themed spans.
    expect(text(result.html)).toContain('const greeting: "hello"')
    expect(text(result.html)).not.toContain('^?')
  })

  test('leaves the query line alone when it is not asked for', async () => {
    const frame = Frame.create()
    const result = await frame.render({ code: query, lang: 'ts', theme: 'vitesse-dark' })
    await frame.dispose()
    expect(result.html).not.toContain('twoslash-query-line')
  })

  test('numbers the lines that survive, so a folded query leaves no gap', async () => {
    // The query line becomes a block and the compiler's complaint becomes a
    // line of its own, and neither is a line of code.
    const frame = Frame.create()
    const code =
      'const greeting = "hello"\n//    ^?\nconst count: number = greeting\nexport { count }\n'
    const result = await frame.render({ code, lang: 'ts', theme: 'vitesse-dark', twoslash: true })
    await frame.dispose()
    expect([...result.html.matchAll(/data-line="(\d+)"/g)].map((match) => match[1]))
      .toMatchInlineSnapshot(`
      [
        "1",
        "2",
        "3",
        "4",
      ]
    `)
  })

  test('draws a run resolved elsewhere the same as one it resolves', async () => {
    // What a build step or a worker hands over: plain data, no compiler.
    const { createTwoslasher } = await import('twoslash')
    const run = createTwoslasher({ handbookOptions: { noErrorValidation: true } })(query, 'ts')
    const frame = Frame.create()
    const resolved = await frame.render({
      code: query,
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: true,
    })
    const given = await frame.render({
      code: query,
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: { code: run.code, nodes: run.nodes },
    })
    await frame.dispose()
    expect(given.html).toBe(resolved.html)
  })

  test('carries a resolved run through a document', async () => {
    const { createTwoslasher } = await import('twoslash')
    const run = createTwoslasher({ handbookOptions: { noErrorValidation: true } })(query, 'ts')
    const frame = Frame.create()
    const html = await frame.toDocument({
      background: 'default',
      code: query,
      lang: 'ts',
      lineNumbers: false,
      padding: 64,
      radius: 12,
      theme: 'vitesse-dark',
      title: '',
      titleBar: true,
      twoslash: { code: run.code, nodes: run.nodes },
      width: 640,
    })
    await frame.dispose()
    // The styles travel with it, or every hover popover would draw.
    expect(html).toContain('twoslash-query-line')
    expect(html).toContain('.twoslash-popup-container')
  })

  test('hands back the styles the annotated markup needs', async () => {
    // The markup carries a popover per identifier, and without these rules a
    // consumer injecting the html alone would draw every one of them.
    const frame = Frame.create()
    const annotated = await frame.render({
      code: query,
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: true,
    })
    const plain = await frame.render({ code: query, lang: 'ts', theme: 'vitesse-dark' })
    await frame.dispose()
    expect(annotated.css).toContain('.twoslash-popup-container')
    expect(plain.css).toBeUndefined()
  })

  test('annotates every dialect the language service reads', async () => {
    // The transformer draws nothing outside its own language list, which it
    // matches against the name it was called with, and the popup it draws is
    // highlighted with a grammar of its own.
    const drawn: Record<string, boolean> = {}
    for (const lang of ['javascript', 'js', 'jsx', 'ts', 'tsx', 'typescript'] as const) {
      const frame = Frame.create()
      const result = await frame.render({
        code: query,
        lang,
        theme: 'vitesse-dark',
        twoslash: true,
      })
      await frame.dispose()
      drawn[lang] = result.html.includes('twoslash-query-line')
    }
    expect(drawn).toMatchInlineSnapshot(`
      {
        "javascript": true,
        "js": true,
        "jsx": true,
        "ts": true,
        "tsx": true,
        "typescript": true,
      }
    `)
  })

  test('marks the code block, which a bare `.twoslash` rule would frame', async () => {
    // The renderer puts `twoslash` on the `pre` itself. Anything styling that
    // class unqualified draws a surface and a notch around the whole block,
    // which is what a consumer's own annotation styles are likely to do.
    const frame = Frame.create()
    const result = await frame.render({
      code: query,
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: true,
    })
    await frame.dispose()
    expect(result.html.slice(0, result.html.indexOf('>') + 1)).toContain('twoslash')
  })

  test('annotates again after the renderer is disposed', async () => {
    // Disposal releases the compiler, so the next annotated render rebuilds it.
    const frame = Frame.create()
    await frame.render({ code: query, lang: 'ts', theme: 'vitesse-dark', twoslash: true })
    await frame.dispose()
    const result = await frame.render({
      code: query,
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: true,
    })
    await frame.dispose()
    expect(result.html).toContain('twoslash-query-line')
  })

  test('still resolves types for code the compiler objects to', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      code: 'const count: number = "no"\n//    ^?\n',
      lang: 'ts',
      theme: 'vitesse-dark',
      twoslash: true,
    })
    await frame.dispose()
    expect(result.html).toContain('twoslash-query-line')
    expect(result.html).toContain('twoslash-error-line')
  })
})

/** A document's visible text, with the markup and entities taken back out. */
function text(html: string) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}
