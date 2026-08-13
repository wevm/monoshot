import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const root = new URL('../app/public/.well-known/agent-skills/', import.meta.url)
const artifact = await readFile(new URL('monoshot/SKILL.md', root))
const source = artifact.toString()
const frontmatter = source.match(/^---\nname: (.+)\ndescription: (.+)\n---\n/)
if (!frontmatter) throw new Error('SKILL.md must start with name and description frontmatter')

const index = JSON.parse(await readFile(new URL('index.json', root), 'utf8')) as {
  skills?: { description?: string; digest?: string; name?: string; type?: string; url?: string }[]
}
const [entry] = index.skills ?? []
const expected = {
  name: frontmatter[1],
  type: 'skill-md',
  description: frontmatter[2],
  url: '/.well-known/agent-skills/monoshot/SKILL.md',
  digest: `sha256:${createHash('sha256').update(artifact).digest('hex')}`,
}
if (index.skills?.length !== 1 || JSON.stringify(entry) !== JSON.stringify(expected))
  throw new Error(`Agent skill discovery is stale:\n${JSON.stringify(expected, null, 2)}`)
