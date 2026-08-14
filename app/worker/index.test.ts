import app from './index.js'

const startFetch = vi.hoisted(() =>
  vi.fn(() => new Response('html', { headers: { 'content-type': 'text/html' } })),
)

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: startFetch },
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
  test('serves shared API health', async () => {
    const response = await app.request('/api/health', {}, env, executionCtx)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

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

  test('serves shared links through the application route', async () => {
    startFetch.mockClear()
    const response = await app.request('/s/abc123', {}, env)
    expect(await response.text()).toBe('html')
    expect(response.headers.get('location')).toBeNull()
    expect(startFetch).toHaveBeenCalledTimes(1)
  })
})
