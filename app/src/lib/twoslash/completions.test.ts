import { createDefaultMapFromNodeModules } from '@typescript/vfs'
import ts from 'typescript'

import * as Completions from './completions.js'

describe('create', () => {
  test('rebuilds completion state with the document ambient roots', () => {
    const compilerOptions = { target: ts.ScriptTarget.ESNext }
    const files = createDefaultMapFromNodeModules(compilerOptions, ts)
    files.set('/node_modules/@types/node/package.json', JSON.stringify({ types: 'index.d.ts' }))
    files.set(
      '/node_modules/@types/node/index.d.ts',
      'declare var process: { env: { NODE_ENV?: string } }',
    )
    const completions = Completions.create({ compiler: ts, compilerOptions, files })
    const code = 'process.e'
    const at = (types: readonly string[]) =>
      completions.at({ code, lang: 'ts', position: code.length, types })

    expect(at([])).toEqual([])
    expect(at(['node']).map((entry) => entry.label)).toEqual(['env'])
    expect(at([])).toEqual([])
  })
})
