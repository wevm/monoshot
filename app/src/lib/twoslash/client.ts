import type * as Twoslash from 'monoshot/twoslash'

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

  return {
    dispose() {
      worker?.terminate()
      worker = undefined
    },
    resolve(code, lang) {
      worker ??= spawn()
      version += 1
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
      else onResult(event.data.result)
    })
    // A worker that fails before its own handler runs, because its chunk will
    // not load or its module scope throws, reports here rather than in a reply.
    // Without this a caller waiting on the current document waits forever.
    instance.addEventListener('error', (event) => {
      // It never installed its own handler, so posting to it again would go
      // nowhere. Dropped, and the next document spawns a fresh one. Guarded on
      // identity, so a worker spawned since is not taken down with it.
      if (worker === instance) {
        worker = undefined
        instance.terminate()
      }
      onError?.(event.message || 'The type resolver could not start.')
    })
    instance.addEventListener('messageerror', () => {
      onError?.('The type resolver sent a reply that could not be read.')
    })
    return instance
  }
}

export declare namespace create {
  type Options = {
    /** Called when a document could not be resolved, including when the worker never starts. */
    onError?: ((message: string) => void) | undefined
    /** Called with the types for the most recent document. */
    onResult: (result: Twoslash.Result) => void
  }

  type ReturnType = {
    /** Stops the worker and releases the compiler it holds. */
    dispose: () => void
    /** Asks for a document's types, superseding any request still in flight. */
    resolve: (code: string, lang: Lang) => void
  }
}
