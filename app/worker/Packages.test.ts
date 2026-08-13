import * as Packages from './Packages.js'

describe('parse', () => {
  test('preserves scoped package names', () => {
    expect(Packages.parse('@shikijs/core@4.4.2')).toEqual({
      name: '@shikijs/core',
      version: '4.4.2',
    })
  })
})

describe('exact', () => {
  test.each(['1.0.0', '4.4.2-beta.1', '1.2.3+build.4'])('accepts exact version %s', (version) => {
    expect(Packages.exact(version)).toBe(true)
  })

  test.each(['latest', 'next', '^1.0.0', '1.x', '*'])('rejects mutable version %s', (version) => {
    expect(Packages.exact(version)).toBe(false)
  })
})

describe('key', () => {
  test('ignores unrelated request query parameters', () => {
    const options = { name: '@shikijs/core', version: '4.4.2' }
    expect(Packages.key('https://example.com/api/types/x?bypass=1', options)).toBe(
      Packages.key('https://example.com/api/types/x?bypass=2', options),
    )
  })
})
