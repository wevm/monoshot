import * as Twoslash from 'monoshot/twoslash'
import ts from 'typescript'
import { createTwoslashFromCDN } from 'twoslash-cdn'
import { createStorage } from 'unstorage'
import indexedDb from 'unstorage/drivers/indexedb'

import { acquire } from '#/lib/twoslash/acquire.js'
import * as Completions from '#/lib/twoslash/completions.js'
import type { Complete, Request, Resolve, Response } from '#/lib/twoslash/protocol.js'

/**
 * The compiler's own lib files survive the tab: they are over a hundred
 * requests to a CDN, and paying that on every reload would make the first
 * annotation of a session cost seconds. Package types are cached by the route
 * that serves them instead.
 */
const storage = createStorage({ driver: indexedDb({ base: 'monoshot:twoslash' }) })

/**
 * ESNext, numerically: the enums live in `typescript`, which belongs in the
 * worker's payload once rather than imported for a few constants.
 */
const compilerOptions = { lib: ['esnext', 'dom'], module: 99, target: 99 }

/**
 * The compiler's file system, held here so acquired packages can be written
 * into it directly rather than through the CDN acquisition this replaces.
 */
const files = new Map<string, string>()

const twoslash = createTwoslashFromCDN({
  fsMap: files,
  // This copy only decides which lib files are fetched, and defaults to ES5
  // when it has no target. `lib` has to be spelled out so the set fetched is
  // the set the compiler then asks for: a mismatch leaves it with no `Promise`
  // at all, and every type behind an `await` collapses to `any`.
  compilerOptions,
  storage,
  twoSlashOptionsOverrides: {
    // And this copy is what the snippet is actually compiled with.
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
/** The newest document asked about, so a late upgrade knows it is stale. */
let version = 0

const completions = Completions.create({ compiler: ts, compilerOptions, files })

self.addEventListener('message', (event: MessageEvent<Request>) => {
  // Completions answer on their own rather than through the queue: a caret is
  // waiting on them, and a document resolve ahead of them takes long enough to
  // make the answer useless by the time it arrives.
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
    // The service reads the compiler's own lib files out of the shared file
    // system, so it cannot answer before they are in it.
    await twoslash.init()
    reply({
      completions: completions.at({
        code: request.code,
        lang: request.lang,
        position: request.position,
      }),
      id: request.id,
      kind: 'complete',
    })
  } catch {
    // A caret with nothing to offer shows no menu, which is what an editor
    // does anyway when a position has no completions.
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
 * Fetches the types for a document's imports, then answers again with them.
 *
 * Still a second stage rather than a precondition: even one request per
 * package is slower than drawing the document, so the first answer never waits
 * on it. Deliberately not awaited by the queue, which stays free to answer the
 * next keystroke while this runs.
 */
async function upgrade(request: Resolve, first: Response) {
  try {
    await acquire({ code: request.code, compiler: ts, files })
    // The program the completion service holds read the file system before
    // these packages were in it, so it would keep answering without them.
    completions.forget()
    // A newer document is already being answered, and brings its own upgrade.
    if (request.version !== version) return
    const upgraded = annotate(request)
    // A document that imports nothing acquires nothing, so this answer repeats
    // the one already sent. Sending it again would repaint every keystroke.
    if (JSON.stringify(upgraded) === JSON.stringify(first)) return
    reply(upgraded)
  } catch (cause) {
    if (request.version === version) reply(failure(request, cause))
  }
}

function annotate(request: Resolve): Response {
  return {
    kind: 'resolve',
    result: Twoslash.annotate(twoslash.runSync(request.code, request.lang)),
    version: request.version,
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
