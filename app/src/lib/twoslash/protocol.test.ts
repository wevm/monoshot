import { without } from './protocol.js'
import type { Run } from './protocol.js'

/** A run twoslash cut a `^?` line out of, carrying one complaint per line. */
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
  test('leaves out the complaint at an offset, counting the cut before it', () => {
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

  test('leaves a complaint before any cut where it is', () => {
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

  test('returns the run it was given when nothing was waved off', () => {
    expect(without(run, [])).toBe(run)
  })
})
