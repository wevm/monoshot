import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import stylex from '@stylexjs/unplugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite-plus'

export default defineConfig(({ mode }) => ({
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
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      remoteBindings: mode !== 'offline',
      ...(mode === 'offline'
        ? {
            config: (config) => {
              config.ai = undefined
            },
          }
        : {}),
    }),
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
    icons({ compiler: 'jsx', jsx: 'react' }),
    react(),
    // The React Compiler memoizes components automatically, so the app does
    // not hand-write useMemo/useCallback. This plugin's oxc pipeline has no
    // babel hook of its own, so the compiler runs through rolldown's.
    babel({ presets: [reactCompilerPreset()] }),
  ],
}))
