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

  test.each([
    'ChatGPT-User',
    'Claude-User',
    'Perplexity-User',
    'MistralAI-User',
    'DuckAssistBot',
    'meta-externalfetcher',
  ])('serves the skill to %s', async (userAgent) => {
    const response = await app.request(
      '/',
      { headers: { accept: 'text/html', 'user-agent': userAgent } },
      env,
    )
    expect(await response.text()).toBe('skill')
    expect(response.headers.get('vary')).toContain('Accept, User-Agent')
  })

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
