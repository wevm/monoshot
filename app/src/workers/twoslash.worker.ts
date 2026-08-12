import { Twoslash } from 'monoshot'
import ts from 'typescript'
import { createTwoslashFromCDN } from 'twoslash-cdn'
import { createStorage } from 'unstorage'
import indexedDb from 'unstorage/drivers/indexedb'

import * as Completions from '#/lib/twoslash/completions.js'
import { compilerOptions } from '#/lib/twoslash/options.js'
import type { Complete, Request, Resolve, Response } from '#/lib/twoslash/protocol.js'

/**
 * The compiler's own lib files survive the tab: they are over a hundred
 * requests to a CDN, and paying that on every reload would make the first
 * annotation of a session cost seconds. Package types are cached by the route
 * that serves them instead.
 */
const storage = createStorage({ driver: indexedDb({ base: 'monoshot:twoslash' }) })

/**
 * The compiler's file system, held here so acquired packages can be written
 * into it directly rather than through the CDN acquisition this replaces.
 */
const files = new Map<string, string>()

const twoslash = createTwoslashFromCDN({
  fsMap: files,
  // This copy only decides which lib files are fetched, and defaults to ES5
  // when it has no target. `lib` has to be spelled out so the set fetched is
  // the set the compiler then requires: a mismatch leaves it with no `Promise`
  // at all, and every type behind an `await` collapses to `any`.
  compilerOptions,
  storage,
  twoSlashOptionsOverrides: {
    // The tags the frame draws, which stay ordinary comments unless the
    // compiler is told to read them.
    customTags: [...Twoslash.tags],
    // This copy configures compilation of the snippet itself.
    compilerOptions,
    // Half-typed code is the normal case in an editor, and twoslash otherwise
    // insists every compiler error be declared in the source.
    handbookOptions: { noErrorValidation: true },
  },
})

/**
 * Only the newest document matters: while one is resolving, anything that
 * arrives replaces its predecessor rather than queueing behind it. Typing
 * during a cold start would otherwise resolve every keystroke in turn.
 */
let pending: Resolve | undefined
let running = false
/** Version of the latest document request, used to discard stale upgrades. */
let version = 0
/** Identifier of the latest completion request, used to discard stale results. */
let asked = 0

const completions = Completions.create({ compiler: ts, compilerOptions, files })

self.addEventListener('message', (event: MessageEvent<Request>) => {
  // Process completions outside the document queue to avoid blocking interactive
  // responses behind document resolution.
  if (event.data.kind === 'complete') {
    void complete(event.data)
    return
  }
  pending = event.data
  version = event.data.version
  void drain()
})

async function complete(request: Complete) {
  try {
    asked = request.id
    // The service reads the compiler's own lib files out of the shared file
    // system, so completion must wait until they are available.
    await twoslash.init()
    // Typing through a cold start queues one of these per keystroke, and the
    // editor abandoned every document but the last long before the lib files
    // landed. Answering them all would compile each in turn ahead of the one
    // still wanted.
    if (request.id !== asked) return reply({ completions: [], id: request.id, kind: 'complete' })
    reply({
      completions: completions.at({
        // Blanked as the annotations are, so a declaration the snippet marks as
        // removed is not suggested as one that is still there. Length-preserving,
        // so the caret still points at what it pointed at.
        code: Twoslash.unchecked(request.code),
        lang: request.lang,
        position: request.position,
      }),
      id: request.id,
      kind: 'complete',
    })
  } catch {
    // Return an empty result when completion resolution fails.
    reply({ completions: [], id: request.id, kind: 'complete' })
  }
}

async function drain() {
  if (running) return
  running = true
  try {
    while (pending) {
      const request = pending
      pending = undefined
      await resolve(request)
    }
  } finally {
    running = false
  }
}

async function resolve(request: Resolve) {
  try {
    // Only the lib files, which the compiler needs before it can resolve
    // anything at all. Acquiring a package's types is a separate stage.
    await twoslash.init()
    const first = annotate(request)
    reply(first)
    void upgrade(request, first)
  } catch (cause) {
    reply(failure(request, cause))
  }
}

/**
 * Fetches declarations for document imports, then returns an upgraded result.
 *
 * Still a second stage rather than a precondition: even one request per
 * package is slower than drawing the document, so the first result does not wait
 * for it. The queue does not await this operation and remains available for the
 * next keystroke while this runs.
 */
async function upgrade(request: Resolve, first: Response) {
  try {
    await Twoslash.acquire({ code: request.code, compiler: ts, files, load })
    // The program the completion service holds read the file system before
    // these packages were available, so invalidate the cached program.
    completions.forget()
    // A newer document has its own upgrade request.
    if (request.version !== version) return
    const upgraded = annotate(request)
    // Skip duplicate results when type acquisition did not change the output.
    if (JSON.stringify(upgraded) === JSON.stringify(first)) return
    reply(upgraded)
  } catch (cause) {
    if (request.version === version) reply(failure(request, cause))
  }
}

function annotate(request: Resolve): Response {
  // The compiler is kept off the lines the snippet marks as removed: blanking
  // keeps every offset, so what it does resolve still lands where it was found.
  const run = twoslash.runSync(Twoslash.unchecked(request.code), request.lang)
  return {
    kind: 'resolve',
    result: Twoslash.annotate(run),
    // Trimmed to what travels: a run carries the compiler's own objects, and
    // only these three fields survive `postMessage` or mean anything after it.
    // The code is the snippet as written rather than as the compiler saw it.
    types: {
      code: Twoslash.cut(request.code, run.meta.removals),
      meta: { removals: run.meta.removals },
      nodes: run.nodes,
    },
    version: request.version,
  }
}

/**
 * Loads one package's declarations through the app route.
 * The route avoids registry CORS restrictions and consolidates tarball requests.
 */
async function load(name: string) {
  try {
    const response = await fetch(`/api/types/${name}`)
    if (!response.ok) return undefined
    return (await response.json()) as { files: Record<string, string>; name: string }
  } catch {
    // Preserve the initial `any` result when declaration loading fails.
    return undefined
  }
}

function failure(request: Resolve, cause: unknown): Response {
  return {
    error: cause instanceof Error ? cause.message : String(cause),
    kind: 'resolve',
    version: request.version,
  }
}

function reply(response: Response) {
  self.postMessage(response)
}
