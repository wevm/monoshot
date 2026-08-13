import app from './index.js'

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: () => new Response('html', { headers: { 'content-type': 'text/html' } }) },
}))

const env = {
  ASSETS: { fetch: () => Promise.resolve(new Response('skill')) },
} as never

describe('agent skill', () => {
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
