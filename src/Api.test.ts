import { Hono } from 'hono'
import { createTwoslasher } from 'twoslash'

import * as Api from './Api.js'
import * as Browser from './internal/Browser.js'

/** Posts a body to the routes, as a Worker would hand them a request. */
async function post(body: unknown) {
  const response = await Api.route.request('/document', {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const text = await response.text()
  return {
    body: response.headers.get('content-type')?.startsWith('application/json')
      ? (JSON.parse(text) as unknown)
      : text,
    status: response.status,
  }
}

describe('create', () => {
  test('renders a snippet to a standalone document', async () => {
    const { body, status } = await post({ code: 'const a = 1\n', lang: 'ts' })
    expect(status).toBe(200)
    expect(body).toContain('<!doctype html>')
    expect(body).toContain('class="canvas"')
    // The standalone document requires no scripts or external requests.
    expect(body).not.toContain('<script')
  })

  test('fits omitted width to rendered lines and preserves an explicit width', async () => {
    const automatic = await post({ code: 'const a = 1\n', lang: 'ts' })
    const fixed = await post({ code: 'const a = 1\n', lang: 'ts', width: 640 })
    expect(automatic.body).toContain('min-width: 320px;\n  width: max-content;')
    expect(automatic.body).toContain('--code-annotation-max-width: none;')
    expect(fixed.body).toContain('width: 640px;')
    expect(fixed.body).not.toContain('--code-annotation-max-width: none;')
  })

  test('resolves queried types by default', async () => {
    const code = 'const greeting = "hello"\n//    ^?\n'
    const { body, status } = await post({ code, lang: 'typescript' })
    expect(status).toBe(200)
    if (typeof body !== 'string') throw new Error('Expected a rendered document.')
    expect(body).toContain('twoslash-query-line')
    expect(body.slice(body.indexOf('<body>'))).not.toContain('^?')
  })

  test('leaves type resolution off when disabled', async () => {
    const code = 'const greeting = "hello"\n//    ^?\n'
    const { body, status } = await post({ code, lang: 'ts', twoslash: false })
    expect(status).toBe(200)
    expect(body).not.toContain('twoslash-query-line')
    expect(body).toContain('^?')
  })

  test('draws a run the caller resolved', async () => {
    const code = 'const greeting = "hello"\n//    ^?\n'
    const run = createTwoslasher({ handbookOptions: { noErrorValidation: true } })(code, 'ts')
    const { body, status } = await post({
      code,
      lang: 'ts',
      twoslash: { code: run.code, meta: { removals: run.meta.removals }, nodes: run.nodes },
    })
    expect(status).toBe(200)
    expect(body).toContain('twoslash-query-line')
  })

  test('refuses resolved nodes without renderer positions', async () => {
    const code = 'const a = 1\n'
    const { body, status } = await post({
      code,
      lang: 'ts',
      twoslash: {
        code,
        meta: { removals: [] },
        nodes: [{ length: 1, start: 6, target: 'a', text: 'const a: 1', type: 'query' }],
      },
    })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "twoslash: Invalid input",
      }
    `)
  })

  test('refuses resolved nodes outside the compiled source', async () => {
    const code = 'const a = 1\n'
    const { body, status } = await post({
      code,
      lang: 'ts',
      twoslash: {
        code,
        meta: { removals: [] },
        nodes: [
          {
            character: 0,
            length: 1,
            line: 2,
            start: 20,
            target: 'a',
            text: 'const a: 1',
            type: 'query',
          },
        ],
      },
    })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "twoslash.nodes.0: the node position is outside the resolved code.",
      }
    `)
  })

  test('refuses a setting the codec would replace rather than reject', async () => {
    const { body, status } = await post({ code: 'const a = 1\n', lang: 'ts', width: 5000 })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "width: Too big: expected number to be <=1600",
      }
    `)
  })

  test('rejects unknown fields instead of dropping them', async () => {
    // A misspelled option would otherwise render at the default and report
    // success, which reads as the request having been understood.
    const { body, status } = await post({ code: 'const a = 1\n', lang: 'ts', lineNumber: true })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "Unrecognized key: "lineNumber"",
      }
    `)
  })

  test('refuses a snippet past what one request may weigh', async () => {
    const { status } = await post({ code: 'x'.repeat(100_001), lang: 'ts' })
    expect(status).toBe(400)
  })

  test('refuses a run resolved against other code', async () => {
    // A client that resolved types, then edited, would otherwise have the
    // stale offsets drawn onto the new snippet.
    const { body, status } = await post({
      code: 'const greeting = "hello"\n',
      lang: 'ts',
      twoslash: { code: 'const other = 2\n', meta: { removals: [] }, nodes: [] },
    })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "twoslash.code: the resolved types belong to different code.",
      }
    `)
  })

  test('accepts a run carrying a notation other than a query', async () => {
    // The cuts come with the run, so a snippet using `---cut---` validates
    // where reconstructing from `^?` lines alone would have refused it.
    const code = 'const a = 1\n// ---cut---\nconst b = a\n//    ^?\n'
    const run = createTwoslasher({ handbookOptions: { noErrorValidation: true } })(code, 'ts')
    const { status } = await post({
      code,
      lang: 'ts',
      twoslash: { code: run.code, meta: { removals: run.meta.removals }, nodes: run.nodes },
    })
    expect(status).toBe(200)
  })

  test('distinguishes rendering failures from invalid requests', async () => {
    // A language nobody bundles is the caller's mistake, and reads as one.
    const { body, status } = await post({ code: 'const a = 1\n', lang: 'klingon' })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "lang: \`klingon\` is not bundled.",
      }
    `)
  })

  test('names the prefix it was mounted under', async () => {
    const mounted = new Hono().route('/v1', Api.route)
    const response = await mounted.request('/v1/openapi.json')
    const spec = (await response.json()) as { paths: Record<string, unknown> }
    expect(Object.keys(spec.paths)).toMatchInlineSnapshot(`
      [
        "/v1/document",
        "/v1/image",
        "/v1/themes",
      ]
    `)
  })

  test('describes success and error responses for every route', async () => {
    const response = await Api.route.request('/openapi.json')
    const spec = (await response.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    const responses = (path: string, method: string) =>
      Object.keys(spec.paths[path]?.[method]?.responses ?? {})
    expect({ document: responses('/document', 'post'), themes: responses('/themes', 'get') })
      .toMatchInlineSnapshot(`
        {
          "document": [
            "200",
            "400",
            "500",
          ],
          "themes": [
            "200",
            "400",
          ],
        }
      `)
  })

  describe('image', () => {
    test('captures the same automatic-width document', async () => {
      const screenshot = vi
        .spyOn(Browser, 'screenshot')
        .mockResolvedValue(new Uint8Array([1, 2, 3]))
      try {
        const route = Api.create({ browser: () => ({ fetch }) as never })
        const response = await route.request('/image', {
          body: JSON.stringify({ code: 'const a = 1\n', lang: 'ts' }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
        expect(response.status).toBe(200)
        expect(screenshot.mock.calls[0]?.[1].html).toContain(
          'min-width: 320px;\n  width: max-content;',
        )
      } finally {
        screenshot.mockRestore()
      }
    })

    test('returns a clear error when browser rendering is unavailable', async () => {
      // Every other route works without one, so this is the deployment's
      // state rather than the request's mistake.
      const response = await Api.route.request('/image', {
        body: JSON.stringify({ code: 'const a = 1\n', lang: 'ts' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchInlineSnapshot(`
        {
          "error": "Browser Rendering is not configured for this deployment.",
        }
      `)
    })

    test('validates a request before invoking browser rendering', async () => {
      // A request it cannot read is answered whether or not one is configured.
      const response = await Api.route.request('/image', {
        body: JSON.stringify({ code: 'const a = 1\n', lang: 'ts', scale: 99 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchInlineSnapshot(`
        {
          "error": "scale: Too big: expected number to be <=6",
        }
      `)
    })
  })

  test('describes itself', async () => {
    const response = await Api.route.request('/openapi.json')
    const spec = (await response.json()) as { paths: Record<string, unknown> }
    expect(response.status).toBe(200)
    expect(Object.keys(spec.paths).sort()).toMatchInlineSnapshot(`
      [
        "/document",
        "/image",
        "/themes",
      ]
    `)
    // Read off the middleware guarding each route, so a path cannot be
    // described without being validated, or validated without being described.
    expect((spec.paths['/themes'] as { get: { parameters: unknown } }).get.parameters)
      .toMatchInlineSnapshot(`
        [
          {
            "in": "query",
            "name": "type",
            "required": false,
            "schema": {
              "enum": [
                "dark",
                "light",
              ],
              "type": "string",
            },
          },
        ]
      `)
    const document = spec.paths['/document'] as {
      post: { requestBody: { content: Record<string, { schema: { properties: object } }> } }
    }
    const properties = document.post.requestBody.content['application/json']?.schema.properties
    expect(Object.keys(properties ?? {})).toMatchInlineSnapshot(`
      [
        "background",
        "code",
        "lang",
        "height",
        "padding",
        "picture",
        "radius",
        "theme",
        "title",
        "titleBar",
        "twoslash",
        "width",
      ]
    `)
  })

  test('refuses a theme that is not bundled', async () => {
    const { body, status } = await post({ code: 'const a = 1\n', lang: 'ts', theme: 'nope' })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "theme: unknown value \`nope\`.",
      }
    `)
  })

  test('refuses a request with no code to draw', async () => {
    expect((await post({ lang: 'ts' })).status).toBe(400)
  })

  test('refuses `auto`, which it cannot resolve without the document', async () => {
    expect(await post({ code: 'const a = 1\n', lang: 'auto' })).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "lang: \`auto\` is not bundled.",
        },
        "status": 400,
      }
    `)
  })

  test('refuses a body that is not JSON', async () => {
    expect((await post('nope')).status).toBe(400)
  })

  test('refuses JSON that is not an object', async () => {
    // Return a response for schema-invalid JSON instead of throwing.
    for (const body of ['1', '[]', '"text"']) expect((await post(body)).status).toBe(400)
  })
})
