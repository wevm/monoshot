import * as Browser from './Browser.js'

const close = vi.fn<() => Promise<void>>()
const disconnect = vi.fn<() => Promise<void>>()
const page = {
  $: vi.fn(() =>
    Promise.resolve({
      boundingBox: () => Promise.resolve({ height: 120, width: 320 }),
      screenshot: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    }),
  ),
  close,
  evaluate: vi.fn(() => Promise.resolve()),
  setContent: vi.fn(() => Promise.resolve()),
  setViewport: vi.fn(() => Promise.resolve()),
}

vi.mock('@cloudflare/puppeteer', () => ({
  connect: vi.fn(),
  launch: vi.fn(() =>
    Promise.resolve({
      disconnect,
      newPage: () => Promise.resolve(page),
    }),
  ),
  sessions: vi.fn(() => Promise.resolve([])),
}))

describe('screenshot', () => {
  test('closes the page before releasing the browser session', async () => {
    const result = await Browser.screenshot({ fetch }, { html: '<main />', scale: 2 })

    expect(result).toEqual(new Uint8Array([1, 2, 3]))
    expect(close).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(disconnect.mock.invocationCallOrder[0]!)
  })
})
