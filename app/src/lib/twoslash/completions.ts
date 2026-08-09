import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import type ts from 'typescript'

import type { Completion, Lang } from './protocol.js'

/**
 * The highest priority the language service gives something reachable from
 * the caret: `10` is declared locally and `11` is otherwise in scope, which
 * covers a document's own values and what it imports. From `15` up are
 * globals, keywords, and auto-imports, and on an empty line that is some nine
 * hundred names nobody is reaching for.
 */
const inScope = '11'

/** Enough entries for any real member list, and a bound on a pathological one. */
const limit = 100

/**
 * Opens a language service over a virtual file system.
 *
 * Twoslash compiles a whole snippet and reports what it found; it has no
 * notion of a caret, so completions need the service itself. The file system
 * is the one twoslash already filled, so the lib files and every acquired
 * package are shared rather than fetched twice.
 */
export function create(options: create.Options): create.ReturnType {
  const { compiler, files } = options
  // `allowJs`, because a document can be JavaScript: without it a `.js` root
  // file is not part of the program at all and the service knows nothing
  // about it.
  const compilerOptions = { ...options.compilerOptions, allowJs: true }
  // Built on the first request rather than at load: a session that never asks
  // for a completion never pays for the program.
  let environment: ReturnType<typeof createVirtualTypeScriptEnvironment> | undefined
  // The root file the current program was built around. A document's language
  // can change under it, and a program only knows the roots it was given.
  let root: string | undefined

  return {
    at(options_at) {
      const { code, lang, position } = options_at
      const path = `/index.${lang}`
      files.set(path, code)
      const service = (() => {
        if (environment && root === path) return environment
        root = path
        environment = createVirtualTypeScriptEnvironment(
          createSystem(files),
          [path],
          compiler,
          compilerOptions,
        )
        return environment
      })()
      // The document changes on every keystroke, and the service is
      // incremental: updating costs a reparse of one file, not a new program.
      if (service.getSourceFile(path)?.text !== code) service.updateFile(path, code)
      const found = service.languageService.getCompletionsAtPosition(path, position, {})
      if (!found) return []
      return found.entries
        .filter((entry) => entry.sortText <= inScope)
        .slice(0, limit)
        .map((entry): Completion => ({ kind: entry.kind, label: entry.name }))
    },
    forget() {
      environment = undefined
      root = undefined
    },
  }
}

export declare namespace create {
  type Options = {
    /** A TypeScript module, which the service is built from. */
    compiler: typeof ts
    /** The options the snippet compiles with, matching the rest of the worker. */
    compilerOptions: ts.CompilerOptions
    /** The virtual file system holding the lib files and acquired packages. */
    files: Map<string, string>
  }

  type ReturnType = {
    /** What the language service would offer at a document offset. */
    at: (options: { code: string; lang: Lang; position: number }) => readonly Completion[]
    /**
     * Drops the service, so the next request builds one over the files as they
     * are now. A program holds its own copy of what it read, so packages
     * acquired since would otherwise stay invisible to it.
     */
    forget: () => void
  }
}
