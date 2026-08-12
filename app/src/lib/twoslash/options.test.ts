import { createTwoslasher } from 'twoslash'

import { compilerOptions } from './options.js'

describe('compilerOptions', () => {
  test('resolves a package subpath its `exports` map declares', () => {
    const twoslasher = createTwoslasher({
      compilerOptions,
      handbookOptions: { noErrorValidation: true },
    })
    // Under the resolution TypeScript falls back to, a subpath is unreachable
    // however the package declares it.
    const result = twoslasher("import { createHighlighterCore } from 'shiki/core'\n", 'ts')
    expect(result.errors.map((error) => error.text)).toMatchInlineSnapshot(`[]`)
  })
})
