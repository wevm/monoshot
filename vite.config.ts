import path from 'node:path'
import { defineConfig } from 'vite-plus'

const dir = import.meta.dirname

export default defineConfig({
  test: {
    alias: {
      monoshot: path.resolve(dir, 'src'),
    },
    coverage: {
      exclude: ['coverage/**', 'dist/**', '**/*.test.ts', '**/*.test-d.ts'],
      provider: 'v8',
    },
    globals: true,
  },
  lint: {
    ignorePatterns: ['app/**', 'dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ['dist/**', 'app/src/routeTree.gen.ts', 'app/worker-configuration.d.ts'],
    printWidth: 100,
    semi: false,
    singleQuote: true,
    sortPackageJson: false,
  },
})
