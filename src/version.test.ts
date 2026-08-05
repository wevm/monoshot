import { version } from './version.js'

describe('version', () => {
  test('matches semver', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
