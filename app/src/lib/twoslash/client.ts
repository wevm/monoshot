import type * as Twoslash from 'monoshot/twoslash'

/** What the worker resolves for a document. */
export type Result = Twoslash.Result

/**
 * A result, carrying the document it describes. Its spans are offsets into
 * that text, so a caller can tell whether they still belong on screen.
 */
export type Resolved = {
  /** The document the types were resolved against. */
  document: string
  /** The types the language service found in it. */
  result: Result
}

import type { Lang, Request, Response } from './protocol.js'

/**
 * Talks to the twoslash worker.
 *
 * The worker carries the TypeScript compiler, so it is spawned on the first
 * document rather than at load, and a caller that never edits TypeScript never
 * pays for it.
 */
export function create(options: create.Options): create.ReturnType {
  const { onError, onResult } = options
  let worker: Worker | undefined
  let version = 0
  // The document the accepted reply will be about: a reply only passes the
  // version check when nothing has been asked since.
  let latest = ''

  return {
    dispose() {
      worker?.terminate()
      worker = undefined
    },
    invalidate() {
      version += 1
    },
    resolve(code, lang) {
      worker ??= spawn()
      version += 1
      latest = code
      const request: Request = { code, lang, version }
      worker.postMessage(request)
    },
  }

  function spawn() {
    // Relative rather than the `#` alias every other import uses: the bundler
    // reads this path statically to find the worker, and does not resolve
    // aliases while doing it.
    const instance = new Worker(new URL('../../workers/twoslash.worker.ts', import.meta.url), {
      type: 'module',
    })
    instance.addEventListener('message', (event: MessageEvent<Response>) => {
      // A reply for a document that has already been edited past is dropped:
      // resolving is slow enough that answers can arrive out of order.
      if (event.data.version !== version) return
      if ('error' in event.data) onError?.(event.data.error)
      else onResult({ document: latest, result: event.data.result })
    })
    // A worker that fails to start never sends a protocol message, so it is
    // dropped here instead. Holding on to it would post every later document
    // into a dead instance; cleared, the next edit spawns a replacement.
    instance.addEventListener('error', (event) => {
      instance.terminate()
      if (worker === instance) worker = undefined
      onError?.(event.message)
    })
    return instance
  }
}

export declare namespace create {
  type Options = {
    /** Called when a document could not be resolved at all. */
    onError?: ((message: string) => void) | undefined
    /** Called with the types for the most recent document. */
    onResult: (resolved: Resolved) => void
  }

  type ReturnType = {
    /** Stops the worker and releases the compiler it holds. */
    dispose: () => void
    /**
     * Drops whatever is still in flight. The answer to a document that has
     * since been edited is about that older document, so it is no more current
     * than no answer at all.
     */
    invalidate: () => void
    /** Asks for a document's types, superseding any request still in flight. */
    resolve: (code: string, lang: Lang) => void
  }
}
