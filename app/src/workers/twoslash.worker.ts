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

self.addEventListener('message', (event: MessageEvent<Request>) => {
  pending = event.data
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
    const result = await twoslash.run(request.code, request.lang)
    reply({ result: Twoslash.annotate(result), version: request.version })
  } catch (cause) {
    reply({
      error: cause instanceof Error ? cause.message : String(cause),
      version: request.version,
    })
  }
}

function reply(response: Response) {
  self.postMessage(response)
}
