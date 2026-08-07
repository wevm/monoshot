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

const twoslash = createTwoslashFromCDN({
  storage,
  twoSlashOptionsOverrides: {
    // ESNext, numerically: the enums live in `typescript`, which belongs in
    // the worker's payload once rather than imported for two constants. Note
    // a snippet's top-level `await` is still not applied, so a type behind one
    // resolves as the promise.
    compilerOptions: { module: 99, moduleResolution: 100, target: 99 },
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
