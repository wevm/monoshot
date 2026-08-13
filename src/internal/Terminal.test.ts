import * as Terminal from './Terminal.js'

describe('preview', () => {
  test('does not render when output is not a terminal', async () => {
    const render = vi.fn<NonNullable<Terminal.preview.Options['render']>>()
    const stream = { isTTY: false, write: vi.fn() }
    expect(await Terminal.preview(new Uint8Array(), { render, stream })).toBe(false)
    expect(render).not.toHaveBeenCalled()
  })

  test('renders within the terminal and writes returned escape sequences', async () => {
    const render = vi.fn<NonNullable<Terminal.preview.Options['render']>>(() =>
      Promise.resolve('\u001B_Gimage\u001B\\'),
    )
    const stream = { isTTY: true, write: vi.fn() }
    const image = new Uint8Array([137, 80, 78, 71])
    expect(await Terminal.preview(image, { render, stream })).toBe(true)
    expect(render).toHaveBeenCalledWith(image, { height: '50%', width: '80%' })
    expect(stream.write).toHaveBeenCalledWith('\u001B_Gimage\u001B\\')
  })

  test('allows a native renderer to write directly', async () => {
    const stream = { isTTY: true, write: vi.fn() }
    expect(
      await Terminal.preview(new Uint8Array(), {
        render: () => Promise.resolve(''),
        stream,
      }),
    ).toBe(true)
    expect(stream.write).not.toHaveBeenCalled()
  })

  test('leaves the image result usable when preview rendering fails', async () => {
    expect(
      await Terminal.preview(new Uint8Array(), {
        render: () => Promise.reject(new Error('unsupported')),
        stream: { isTTY: true, write: vi.fn() },
      }),
    ).toBe(false)
  })
})
