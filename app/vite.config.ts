import { cloudflare } from '@cloudflare/vite-plugin'
import stylex from '@stylexjs/unplugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  // Resolve the workspace `monoshot` package through its `src` export
  // condition so the app consumes library source without a dist build.
  resolve: {
    conditions: ['src'],
  },
  environments: {
    ssr: {
      resolve: {
        conditions: ['src'],
      },
    },
  },
  plugins: [
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
    // The React Compiler memoizes components automatically, so the app does
    // not hand-write useMemo/useCallback.
    react({ babel: { plugins: ['babel-plugin-react-compiler'] } }),
  ],
})
