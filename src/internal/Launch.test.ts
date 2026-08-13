import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'

import * as Launch from './Launch.js'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

describe('open', () => {
  test('passes Windows URLs directly to Explorer without a command interpreter', async () => {
    const child = new EventEmitter()
    Object.assign(child, { unref: vi.fn() })
    vi.mocked(spawn).mockReturnValue(child as never)

    const opening = Launch.open({
      platform: 'win32',
      url: 'https://example.com/?one=1&two=2#fragment',
    })
    child.emit('spawn')
    await opening

    expect(spawn).toHaveBeenCalledWith(
      'explorer.exe',
      ['https://example.com/?one=1&two=2#fragment'],
      { detached: true, stdio: 'ignore' },
    )
  })

  test('reports a platform handler that fails to start', async () => {
    const child = new EventEmitter()
    Object.assign(child, { unref: vi.fn() })
    vi.mocked(spawn).mockReturnValue(child as never)

    const opening = Launch.open({ platform: 'linux', url: 'https://example.com' })
    child.emit('error', new Error('not installed'))

    await expect(opening).rejects.toThrow('not installed')
  })
})
