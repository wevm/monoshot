import { without } from './protocol.js'
import type { Run } from './protocol.js'

/** Twoslash run with one removed `^?` line and one diagnostic per source line. */
const run: Run = {
  code: 'const a = 1\nconst b = 2\n',
  // The document had a six-character line between them that twoslash removed.
  meta: { removals: [[12, 18]] },
  nodes: [
    { length: 1, start: 6, type: 'error' } as Run['nodes'][number],
    { length: 1, start: 18, type: 'error' } as Run['nodes'][number],
    { length: 1, start: 18, type: 'hover' } as Run['nodes'][number],
  ],
}

describe('without', () => {
  test('removes a diagnostic after mapping preceding source cuts', () => {
    // Offset 24 in the document is 18 in the code twoslash returned.
    expect(without(run, [24]).nodes.map((node) => [node.type, node.start])).toMatchInlineSnapshot(`
      [
        [
          "error",
          6,
        ],
        [
          "hover",
          18,
        ],
      ]
    `)
  })

  test('preserves a diagnostic before any source cut', () => {
    expect(without(run, [6]).nodes.map((node) => [node.type, node.start])).toMatchInlineSnapshot(`
      [
        [
          "error",
          18,
        ],
        [
          "hover",
          18,
        ],
      ]
    `)
  })

  test('returns the original run when no diagnostics are ignored', () => {
    expect(without(run, [])).toBe(run)
  })
})
