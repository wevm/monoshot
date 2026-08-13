import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { AutoHighlightResult, LanguageFn } from 'highlight.js'
import type { BundledLanguage } from 'shiki'

export { list as languages, title, typed } from './language.js'

/**
 * The grammars detection can recognise, which is a subset: highlight.js bundles
 * every one eagerly, and it has no grammar at all for several of the above.
 * Registered one at a time rather than through the default bundle, which
 * contains all approximately 190 languages supported by highlight.js.
 */
const detectable: readonly { grammar: LanguageFn; id: BundledLanguage; name: string }[] = [
  // Highlight.js resolves equal scores by registration order. Prefer TypeScript
  // for ambiguous C-family snippets.
  { grammar: typescript, id: 'typescript', name: 'typescript' },
  { grammar: bash, id: 'bash', name: 'bash' },
  { grammar: c, id: 'c', name: 'c' },
  { grammar: cpp, id: 'cpp', name: 'cpp' },
  { grammar: csharp, id: 'csharp', name: 'csharp' },
  { grammar: css, id: 'css', name: 'css' },
  { grammar: go, id: 'go', name: 'go' },
  { grammar: java, id: 'java', name: 'java' },
  { grammar: javascript, id: 'javascript', name: 'javascript' },
  { grammar: json, id: 'json', name: 'json' },
  { grammar: kotlin, id: 'kotlin', name: 'kotlin' },
  { grammar: markdown, id: 'markdown', name: 'markdown' },
  { grammar: php, id: 'php', name: 'php' },
  { grammar: python, id: 'python', name: 'python' },
  { grammar: ruby, id: 'ruby', name: 'ruby' },
  { grammar: rust, id: 'rust', name: 'rust' },
  { grammar: sql, id: 'sql', name: 'sql' },
  { grammar: swift, id: 'swift', name: 'swift' },
  { grammar: xml, id: 'html', name: 'xml' },
  { grammar: yaml, id: 'yaml', name: 'yaml' },
]

const ids = new Map<string, BundledLanguage>()
for (const language of detectable) {
  hljs.registerLanguage(language.name, language.grammar)
  ids.set(language.name, language.id)
}

/**
 * Highlight.js scores a guess by how much of a grammar it matched, so a line
 * or two of anything scores low. Under this the snippet is too slight to call.
 */
const confident = 6

/**
 * Returns the detected language, or `undefined` when confidence is insufficient to
 * act on. A caller keeps the language it has in that case, rather than
 * recoloring on a coin toss.
 */
export function detect(code: string): BundledLanguage | undefined {
  if (code.trim().length < 24) return undefined
  const result = hljs.highlightAuto(code)
  return read(result, code) ?? read(result.secondBest, code)
}

function read(result: AutoHighlightResult | undefined, code: string) {
  if (!result || result.relevance < confident) return undefined
  const id = ids.get(result.language ?? '')
  // Highlight.js scores PHP without ever needing an open tag, so it wins on
  // other C-family languages written in their own syntax. Real PHP says so.
  if (!id || (id === 'php' && !/<\?(php|=)/.test(code))) return undefined
  return id
}
