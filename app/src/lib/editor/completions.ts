import { autocompletion } from '@codemirror/autocomplete'
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

import type { Completion } from '#/lib/twoslash/protocol.js'

/**
 * Offers what the language service would at the caret.
 *
 * The document travels with every request rather than the service reading the
 * last one resolved: a keystroke arrives before the document it produced has
 * been resolved, and completing against the previous text offers stale names.
 */
export function completions(ask: completions.Ask): Extension {
  return autocompletion({
    override: [
      async (context: CompletionContext): Promise<CompletionResult | null> => {
        const word = context.matchBefore(/[$\w]*/)
        // A caret just after `.` has no word yet but is exactly where a member
        // list belongs, so it opens the menu the same as typing a letter does.
        const member = context.matchBefore(/\.$/)
        if (!context.explicit && !member && (!word || word.from === word.to)) return null
        const found = await ask(context.state.doc.toString(), context.pos)
        if (!found.length) return null
        return {
          from: word?.from ?? context.pos,
          options: found.map((entry) => ({
            label: entry.label,
            ...(kinds[entry.kind] ? { type: kinds[entry.kind] } : {}),
            // The service decides both what to insert and what it replaces,
            // which for a private `#field` or a quoted member is neither the
            // label nor the word the editor matched on.
            ...(entry.insert === undefined && entry.from === undefined
              ? {}
              : {
                  apply: (view: EditorView, _completion: unknown, from: number, to: number) =>
                    view.dispatch({
                      changes: {
                        from: entry.from ?? from,
                        insert: entry.insert ?? entry.label,
                        to: entry.to ?? to,
                      },
                    }),
                }),
          })),
        }
      },
    ],
  })
}

export declare namespace completions {
  /** Asks what could go at an offset in a document. */
  type Ask = (code: string, position: number) => Promise<readonly Completion[]>
}

/**
 * The language service's kinds in the editor's vocabulary, which decides the
 * icon beside an entry. Anything unlisted goes without one.
 */
const kinds: Record<string, string> = {
  class: 'class',
  const: 'constant',
  enum: 'enum',
  'enum member': 'constant',
  function: 'function',
  interface: 'interface',
  keyword: 'keyword',
  let: 'variable',
  method: 'method',
  module: 'namespace',
  parameter: 'variable',
  property: 'property',
  'type parameter': 'type',
  var: 'variable',
}
