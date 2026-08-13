import { spawn } from 'node:child_process'

/** Opens an HTTP link with the platform URL handler. */
export function open(options: open.Options): Promise<void> {
  const platform = options.platform ?? process.platform
  const [command, args]: [string, readonly string[]] =
    platform === 'darwin'
      ? ['open', [options.url]]
      : platform === 'win32'
        ? ['explorer.exe', [options.url]]
        : ['xdg-open', [options.url]]
  const child = spawn(command, [...args], { detached: true, stdio: 'ignore' })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export declare namespace open {
  type Options = {
    /** Operating system whose URL handler is used. Defaults to the current platform. */
    platform?: NodeJS.Platform | undefined
    /** HTTP or HTTPS URL to open. */
    url: string
  }
}
