import { createTwoslasher } from 'twoslash'

import * as Api from './Api.js'

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
    // Nothing to fetch and nothing to run: it is what a browser screenshots.
    expect(body).not.toContain('<script')
  })

  test('draws a run the caller resolved', async () => {
    const code = 'const greeting = "hello"\n//    ^?\n'
    const run = createTwoslasher({ handbookOptions: { noErrorValidation: true } })(code, 'ts')
    const { body, status } = await post({
      code,
      lang: 'ts',
      twoslash: { code: run.code, nodes: run.nodes },
    })
    expect(status).toBe(200)
    expect(body).toContain('twoslash-query-line')
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

  test('refuses a field it does not know, rather than dropping it', async () => {
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
      twoslash: { code: 'const other = 2\n', nodes: [] },
    })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "twoslash.code: the resolved types belong to different code.",
      }
    `)
  })

  test('describes itself', async () => {
    const response = await Api.route.request('/openapi.json')
    const spec = (await response.json()) as { paths: Record<string, unknown> }
    expect(response.status).toBe(200)
    expect(Object.keys(spec.paths)).toMatchInlineSnapshot(`
      [
        "/document",
        "/themes",
      ]
    `)
    // Read off the schema the route validates with, rather than written twice.
    const document = spec.paths['/document'] as {
      post: { requestBody: { content: Record<string, { schema: { properties: object } }> } }
    }
    const properties = document.post.requestBody.content['application/json']?.schema.properties
    expect(Object.keys(properties ?? {})).toMatchInlineSnapshot(`
      [
        "background",
        "code",
        "lang",
        "lineNumbers",
        "padding",
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
        "error": "theme: \`nope\` is not bundled.",
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
          "error": "lang: name the language to render.",
        },
        "status": 400,
      }
    `)
  })

  test('refuses a body that is not JSON', async () => {
    expect((await post('nope')).status).toBe(400)
  })

  test('refuses JSON that is not an object', async () => {
    // Valid JSON the schema cannot read: it must answer, not throw.
    for (const body of ['1', '[]', '"text"']) expect((await post(body)).status).toBe(400)
  })
})
