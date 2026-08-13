import type { Twoslash } from 'monoshot'

/** What the worker resolves for a document. */
export type Result = Twoslash.Result

/**
 * A result, carrying the document it describes. Its spans are offsets into
 * that text, so a caller can tell whether they still belong on screen.
 */
export type Resolved = {
  /** The document the types were resolved against. */
  document: string
  /** The dialect it was read as. The same text means different things in each. */
  lang: Lang
  /** The types the language service found in it. */
  result: Result
  /** The run those types were read from, which the frame draws directly. */
  types: Run
}

import type { Completion, Lang, Request, Response, Run } from './protocol.js'

/**
 * Talks to the twoslash worker.
 *
 * The worker contains the TypeScript compiler and starts on the first document,
 * avoiding compiler startup for sessions that do not use TypeScript.
 */
export function create(options: create.Options): create.ReturnType {
  const { onError, onLoading, onResult } = options
  let worker: Worker | undefined
  let version = 0
  let asked = 0
  /** Completion requests still waiting on the worker, by request id. */
  const waiting = new Map<number, (completions: readonly Completion[]) => void>()
  // The document associated with the latest accepted response.
  let latest = ''
  let dialect: Lang = 'ts'
  /** Packages loading for the current document. */
  const loading = new Set<string>()

  return {
    dispose() {
      worker?.terminate()
      worker = undefined
      settle()
      clear()
    },
    complete(code, lang, position) {
      const instance = start()
      // Return an empty result when the worker cannot start.
      if (!instance) return Promise.resolve([])
      const id = (asked += 1)
      instance.postMessage({ code, id, kind: 'complete', lang, position } satisfies Request)
      return new Promise((resolve) => waiting.set(id, resolve))
    },
    invalidate() {
      version += 1
      clear()
    },
    resolve(code, lang, versions = {}) {
      version += 1
      latest = code
      dialect = lang
      clear()
      const instance = start()
      if (!instance) return
      instance.postMessage({ code, kind: 'resolve', lang, version, versions } satisfies Request)
    },
  }

  /** Resolves every pending completion request with an empty result. */
  function settle() {
    for (const resolve of waiting.values()) resolve([])
    waiting.clear()
  }

  /** Clears package loading state when its document is superseded. */
  function clear() {
    if (!loading.size) return
    loading.clear()
    onLoading?.([])
  }

  function start() {
    try {
      return (worker ??= spawn())
    } catch (cause) {
      // A document policy can forbid workers outright, and the constructor
      // throws before an error listener is installed. `worker` stays
      // unset, so a later edit tries again.
      onError?.(cause instanceof Error ? cause.message : String(cause))
      return undefined
    }
  }

  function spawn() {
    // Relative rather than the `#` alias every other import uses: the bundler
    // reads this path statically to find the worker, and does not resolve
    // aliases while doing it.
    const instance = new Worker(new URL('../../workers/twoslash.worker.ts', import.meta.url), {
      type: 'module',
    })
    instance.addEventListener('message', (event: MessageEvent<Response>) => {
      if (event.data.kind === 'complete') {
        waiting.get(event.data.id)?.(event.data.completions)
        waiting.delete(event.data.id)
        return
      }
      // A reply for a document that has already been edited past is dropped:
      // resolution latency allows responses to arrive out of order.
      if (event.data.version !== version) return
      if (event.data.kind === 'loading') {
        const before = loading.size
        if (event.data.loading) loading.add(event.data.name)
        else loading.delete(event.data.name)
        if (before !== loading.size) onLoading?.([...loading])
        return
      }
      if ('error' in event.data) onError?.(event.data.error)
      else
        onResult({
          document: latest,
          lang: dialect,
          result: event.data.result,
          types: event.data.types,
        })
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
      // Resolve pending completions because this worker cannot respond.
      settle()
      clear()
      onError?.(event.message || 'The type resolver could not start.')
    })
    instance.addEventListener('messageerror', () => {
      settle()
      clear()
      onError?.('The type resolver sent a reply that could not be read.')
    })
    return instance
  }
}

export declare namespace create {
  type Options = {
    /** Called when a document could not be resolved, including when the worker never starts. */
    onError?: ((message: string) => void) | undefined
    /** Called when the packages loading for the current document change. */
    onLoading?: ((packages: readonly string[]) => void) | undefined
    /** Called with the types for the most recent document. */
    onResult: (resolved: Resolved) => void
  }

  type ReturnType = {
    /** Stops the worker and releases the compiler it holds. */
    dispose: () => void
    /**
     * Invalidates in-flight resolution results after the document changes.
     */
    invalidate: () => void
    /** Returns completion entries at a document offset, or an empty array. */
    complete: (code: string, lang: Lang, position: number) => Promise<readonly Completion[]>
    /** Resolves document types and supersedes any in-flight request. */
    resolve: (code: string, lang: Lang, versions?: Readonly<Record<string, string>>) => void
  }
}
