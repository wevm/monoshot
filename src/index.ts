/**
 * Renders a frame over HTTP, as routes to mount on a Hono app. See
 * {@link Api.route} for the ready-made ones and {@link Api.create} to choose
 * the renderer they draw with.
 */
export * as Api from './Api.js'
/**
 * Packs everything on screen into a URL fragment and reads it back, so a frame
 * travels as a link. See {@link Codec.serialize} and {@link Codec.deserialize}.
 */
export * as Codec from './Codec.js'
export * as Frame from './Frame.js'
export * as Theme from './Theme.js'
export { version } from './version.js'
