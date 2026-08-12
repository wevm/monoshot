import path from 'node:path'
import { defineConfig } from 'vite-plus'

const dir = import.meta.dirname

export default defineConfig({
  test: {
    // Anchored, because a bare prefix rewrites every subpath with it:
    // `monoshot/headless` became `src/headless`, which only a case-insensitive
    // file system finds, so it resolved on macOS and not on Linux.
    alias: [
      { find: /^monoshot$/, replacement: path.resolve(dir, 'src/index.ts') },
      { find: /^monoshot\/headless$/, replacement: path.resolve(dir, 'src/Headless.ts') },
    ],
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
