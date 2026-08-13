import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cache = mkdtempSync(join(tmpdir(), 'monoshot-pack-'))
const output = (() => {
  try {
    return execFileSync('npm', ['pack', '--dry-run', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: cache },
    })
  } finally {
    rmSync(cache, { force: true, recursive: true })
  }
})()
const packed = JSON.parse(output) as {
  files: { path: string }[]
}[]
const files = packed[0]?.files.map((file) => file.path) ?? []
const tests = files.filter((file) => /\.test(?:-d)?\.ts$/.test(file))
if (tests.length) throw new Error(`Package contains test sources:\n${tests.join('\n')}`)

for (const required of ['dist/index.js', 'dist/index.d.ts', 'src/index.ts', 'src/bin.ts'])
  if (!files.includes(required)) throw new Error(`Package is missing ${required}`)
