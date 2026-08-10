import { createTwoslasher } from 'twoslash'

import * as Api from './Api.js'

/** Posts a body to the routes, as a Worker would hand them a request. */
async function post(body: unknown) {
  const response = await Api.create().request('/document', {
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
        "error": "Out of range: width.",
        "fields": [
          "width",
        ],
      }
    `)
  })

  test('refuses a theme that is not bundled', async () => {
    const { body, status } = await post({ code: 'const a = 1\n', lang: 'ts', theme: 'nope' })
    expect(status).toBe(400)
    expect(body).toMatchInlineSnapshot(`
      {
        "error": "\`nope\` is not a bundled theme.",
      }
    `)
  })

  test('refuses a request with no code to draw', async () => {
    expect(await post({ lang: 'ts' })).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Send the code to render.",
        },
        "status": 400,
      }
    `)
  })

  test('refuses `auto`, which it cannot resolve without the document', async () => {
    expect(await post({ code: 'const a = 1\n' })).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Name the language to render.",
        },
        "status": 400,
      }
    `)
  })

  test('refuses a body that is not JSON', async () => {
    expect(await post('nope')).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Send a JSON body.",
        },
        "status": 400,
      }
    `)
  })
})
