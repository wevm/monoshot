/** Displays a PNG with the best image protocol supported by the active terminal. */
export async function preview(image: Uint8Array, options: preview.Options = {}): Promise<boolean> {
  const stream = options.stream ?? process.stdout
  if (!stream.isTTY) return false
  try {
    const render = options.render ?? (await import('terminal-image')).default.buffer
    const output = await render(image, { height: '50%', width: '80%' })
    if (output) stream.write(output)
    return true
  } catch {
    return false
  }
}

export declare namespace preview {
  type Options = {
    /** Image renderer. Defaults to `terminal-image`. */
    render?: Render | undefined
    /** Terminal output stream. Defaults to standard output. */
    stream?: Stream | undefined
  }

  type Render = (image: Uint8Array, options: { height: string; width: string }) => Promise<string>

  type Stream = {
    isTTY?: boolean | undefined
    write: (chunk: string) => unknown
  }
}
