import * as Twoslash from 'monoshot/twoslash'
import { createTwoslashFromCDN } from 'twoslash-cdn'
import { createStorage } from 'unstorage'
import indexedDb from 'unstorage/drivers/indexedb'

import type { Request, Response } from '#/lib/twoslash/protocol.js'

/**
 * Acquired type packages survive the tab: they are fetched from a CDN, and
 * paying that on every reload would make the first annotation of a session
 * cost seconds.
 */
const storage = createStorage({ driver: indexedDb({ base: 'monoshot:twoslash' }) })

/**
 * ESNext, numerically: the enums live in `typescript`, which belongs in the
 * worker's payload once rather than imported for a few constants.
 */
const compilerOptions = { lib: ['esnext', 'dom'], module: 99, target: 99 }

const twoslash = createTwoslashFromCDN({
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
let pending: Request | undefined
let running = false
/** The newest document asked about, so a late upgrade knows it is stale. */
let version = 0

self.addEventListener('message', (event: MessageEvent<Request>) => {
  pending = event.data
  version = event.data.version
  void drain()
})

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

async function resolve(request: Request) {
  try {
    // Only the lib files, which the compiler needs before it can resolve
    // anything at all. Acquiring a package's types is a separate stage.
    await twoslash.init()
    const first = annotate(request)
    reply(first)
    void acquire(request, first)
  } catch (cause) {
    reply(failure(request, cause))
  }
}

/**
 * Fetches the types for a document's imports, then answers again with them.
 *
 * Acquisition walks a package's declaration files one request at a time, which
 * is hundreds of round trips for a package like `shiki`, so it never gates the
 * first answer: that one lands with the document's own types, and this one
 * replaces it. Deliberately not awaited by the queue, which stays free to
 * answer the next keystroke while this runs.
 */
async function acquire(request: Request, first: Response) {
  try {
    await twoslash.prepareTypes(request.code)
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

function annotate(request: Request): Response {
  return {
    result: Twoslash.annotate(twoslash.runSync(request.code, request.lang)),
    version: request.version,
  }
}

function failure(request: Request, cause: unknown): Response {
  return {
    error: cause instanceof Error ? cause.message : String(cause),
    version: request.version,
  }
}

function reply(response: Response) {
  self.postMessage(response)
}
