declare module '*.css?url' {
  const url: string
  export default url
}

declare module 'virtual:stylex:css-only' {}

interface ImportMetaEnv {
  readonly DEV: boolean
  /** Origin this deployment answers at, for the absolute URLs a crawler reads. */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
