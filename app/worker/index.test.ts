import app from './index.js'

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: () => new Response('html', { headers: { 'content-type': 'text/html' } }) },
}))

const env = {
  ASSETS: { fetch: () => Promise.resolve(new Response('skill')) },
} as never
const executionCtx = { passThroughOnException: vi.fn(), waitUntil: vi.fn() } as never

async function document(body: unknown) {
  const response = await app.request(
    '/api/document',
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    env,
    executionCtx,
  )
  return response.text()
}

describe('api rendering', () => {
  test('applies curated theme framing when frame options are omitted', async () => {
    const html = await document({ code: 'const a = 1', lang: 'typescript', theme: 'tempo' })
    expect(html).toContain('background: url("data:image/webp;base64,c2tpbGw=") center / cover;')
    expect(html).toContain('border-radius: 0px;')
  })

  test('preserves explicit frame options for curated themes', async () => {
    const html = await document({
      background: 'none',
      code: 'const a = 1',
      lang: 'typescript',
      radius: 8,
      theme: 'tempo',
    })
    expect(html).toContain('background: transparent;')
    expect(html).toContain('border-radius: 8px;')
  })

  test('rejects oversized bodies before preprocessing them', async () => {
    const response = await app.request(
      '/api/document',
      {
        body: 'x'.repeat(5 * 1024 * 1024 + 1),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
      env,
      executionCtx,
    )
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'The request body is too large.' })
  })
})

describe('sharing', () => {
  test('rejects oversized bodies without relying on Content-Length', async () => {
    const response = await app.request(
      '/api/share',
      {
        body: 'x'.repeat(40_001),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
      env,
      executionCtx,
    )
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'That snippet is too large to share.' })
  })
})

describe('agent skill', () => {
  test.each(['/SKILL.md', '/md', '/skill', '/llms.txt'])('serves the skill at %s', async (path) => {
    const response = await app.request(path, {}, env)
    expect(await response.text()).toBe('skill')
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
  })

  test('serves the skill when Markdown is accepted', async () => {
    const response = await app.request('/', { headers: { accept: 'text/markdown' } }, env)
    expect(await response.text()).toBe('skill')
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
  })

  test('serves the application when every content type is accepted', async () => {
    const response = await app.request('/', { headers: { accept: '*/*' } }, env)
    expect(await response.text()).toBe('html')
    expect(response.headers.get('content-type')).toBe('text/html')
  })

  test.each([
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ChatGPT-User/2.0',
    'Claude-User',
    'anthropic-ai',
    'ClaudeBot',
    'claude-web',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'FacebookBot',
    'meta-externalagent',
    'meta-externalfetcher',
    'Bytespider',
    'cohere-ai',
    'AI2Bot',
    'CCBot',
    'Diffbot',
    'DuckAssistBot',
    'omgili',
    'Timpibot',
    'MistralAI-User',
    'GoogleAgent-Mariner',
  ])('serves the skill to %s', async (userAgent) => {
    const response = await app.request(
      '/',
      { headers: { accept: 'text/html', 'user-agent': userAgent } },
      env,
    )
    expect(await response.text()).toBe('skill')
    expect(response.headers.get('vary')).toContain('Accept, User-Agent')
  })

  test.each(['curl/8.7.1', 'Wget/1.25.0', 'HTTPie/3.2.4', 'httpie-go/1.0.0', 'xh/0.24.1'])(
    'serves the skill to %s',
    async (userAgent) => {
      const response = await app.request(
        '/',
        { headers: { accept: '*/*', 'user-agent': userAgent } },
        env,
      )
      expect(await response.text()).toBe('skill')
      expect(response.headers.get('vary')).toContain('Accept, User-Agent')
    },
  )

  test('serves the application to browsers', async () => {
    const response = await app.request(
      '/',
      { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' } },
      env,
    )
    expect(await response.text()).toBe('html')
    expect(response.headers.get('content-type')).toBe('text/html')
  })
})

describe('security headers', () => {
  test('protects browser responses', async () => {
    const response = await app.request(
      '/',
      { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' } },
      env,
    )
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-security-policy': expect.stringContaining("frame-ancestors 'none'"),
      'permissions-policy': 'camera=(), geolocation=(), microphone=()',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    })
  })
})
