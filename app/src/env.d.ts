declare module '*.css?url' {
  const url: string
  export default url
}

declare module 'virtual:stylex:css-only' {}

interface ImportMetaEnv {
  readonly DEV: boolean
  /** Absolute deployment origin used in link-preview metadata. */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
