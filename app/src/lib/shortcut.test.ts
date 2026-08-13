import { scoped } from './shortcut.js'

const key = { altKey: false, ctrlKey: false, key: 'T', metaKey: false }

describe('scoped shortcut', () => {
  test('accepts a character within its active surface', () => {
    expect(scoped(key, { active: true, editable: false })).toBe('t')
  })

  test('does not capture characters outside its active surface', () => {
    expect(scoped(key, { active: false, editable: false })).toBeUndefined()
  })

  test('does not capture editable or modified input', () => {
    expect(scoped(key, { active: true, editable: true })).toBeUndefined()
    expect(scoped({ ...key, metaKey: true }, { active: true, editable: false })).toBeUndefined()
  })
})
