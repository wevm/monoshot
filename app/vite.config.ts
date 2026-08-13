import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import stylex from '@stylexjs/unplugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite-plus'
import type { Assets } from 'vocs/server/openapi/assets'

const openApiAssetsId = '\0monoshot:openapi-assets'
let openApiAssets: Promise<Assets> | undefined

function loadOpenApiAssets() {
  return (openApiAssets ??= import('vocs/server/openapi/assets.generated').then(
    ({ assets }) => assets,
  ))
}

function emitOpenApiAssets(): Plugin {
  return {
    name: 'monoshot:openapi-assets',
    apply: 'build',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        source === './assets.generated.js' &&
        importer?.match(/[/\\]vocs[/\\](?:src|dist)[/\\]server[/\\]openapi[/\\]assets\.(?:js|ts)$/)
      )
        return openApiAssetsId
    },
    async load(id) {
      if (id !== openApiAssetsId) return
      const assets = await loadOpenApiAssets()
      return `export const assets = ${JSON.stringify({
        built: true,
        entry: assets.entry,
        files: {},
        styles: assets.styles,
      })}`
    },
    async generateBundle() {
      if (this.environment.name !== 'client') return
      const assets = await loadOpenApiAssets()
      for (const [name, file] of Object.entries(assets.files))
        this.emitFile({
          type: 'asset',
          fileName: `api/_vocs/openapi/${name}`,
          source:
            file.encoding === 'base64'
              ? Uint8Array.from(atob(file.body), (character) => character.charCodeAt(0))
              : file.body,
        })
    },
  }
}

export default defineConfig({
  // Resolve the workspace `monoshot` package through its `src` export
  // condition so the app consumes library source without a dist build.
  resolve: {
    conditions: ['src'],
  },
  environments: {
    ssr: {
      build: {
        minify: true,
      },
      resolve: {
        conditions: ['src'],
      },
    },
  },
  plugins: [
    // Keep Vocs browser files in Workers Static Assets instead of the Worker bundle.
    emitOpenApiAssets(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    // `css-only` + `devPersistToDisk` bridge the workerd SSR process and the
    // client dev server (no index.html for the default `full` mode to inject
    // into). See facebook/stylex example-redwoodsdk.
    stylex.vite({
      devMode: 'css-only',
      devPersistToDisk: true,
      runtimeInjection: false,
      useCSSLayers: {
        before: ['reset', 'vendor', 'tokens'],
        after: [],
        prefix: 'stylex',
      },
    }),
    react(),
    // The React Compiler memoizes components automatically, so the app does
    // not hand-write useMemo/useCallback. This plugin's oxc pipeline has no
    // babel hook of its own, so the compiler runs through rolldown's.
    babel({ presets: [reactCompilerPreset()] }),
  ],
})
