declare module '*.css?url' {
  const url: string
  export default url
}

declare module 'virtual:stylex:css-only' {}

interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
