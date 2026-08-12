import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import type ts from 'typescript'

import type { Completion, Lang } from './protocol.js'

/**
 * Sort-text threshold for position-specific completions. Lower priorities include locally declared,
 * otherwise in scope, optional members, members from a spread, and suggested
 * class members. Higher priorities contain globals, keywords, and auto-imports.
 */
const global = '15'

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
  // file is excluded from the program.
  const compilerOptions = { ...options.compilerOptions, allowJs: true }
  // Build lazily to avoid creating a program when completion is unused.
  let environment: ReturnType<typeof createVirtualTypeScriptEnvironment> | undefined
  // The root file the current program was built around. A document's language
  // can change, and the program retains its original roots.
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
      // Uncapped: the editor filters by what has been typed and windows the
      // list itself, and a cap here would hide the one entry a prefix matches.
      return found.entries
        .filter((entry) => entry.sortText < global)
        .map((entry): Completion => {
          // What the service would insert can differ from what it displays, as
          // it does for a private `#field` or a quoted member, and the span it
          // replaces can start before the caret's own word.
          const span = entry.replacementSpan
          return {
            kind: entry.kind,
            label: entry.name,
            ...(entry.insertText === undefined ? {} : { insert: entry.insertText }),
            ...(span ? { from: span.start, to: span.start + span.length } : {}),
          }
        })
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

  /** A caret to offer completions at. */
  type At = {
    /** The document the caret sits in. */
    code: string
    /** The dialect to read `code` as. */
    lang: Lang
    /** Document offset of the caret. */
    position: number
  }

  type ReturnType = {
    /** What the language service would offer at a document offset. */
    at: (options: At) => readonly Completion[]
    /**
     * Drops the service, so the next request builds one over the files as they
     * are now. A program holds its own copy of what it read, so packages
     * acquired since would otherwise stay invisible to it.
     */
    forget: () => void
  }
}
