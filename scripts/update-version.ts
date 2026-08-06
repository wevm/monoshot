// Syncs `src/version.ts` with the package.json version. Runs as part of
// `changeset:version` so the source constant never lags a release.
import * as fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const file = new URL('../src/version.ts', import.meta.url)
const content = fs.readFileSync(file, 'utf8')
fs.writeFileSync(file, content.replace(/version = '[^']+'/, `version = '${pkg.version}'`))
