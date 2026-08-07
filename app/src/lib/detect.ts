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

type Language = {
  /** The name highlight.js knows the grammar by; some grammars embed others. */
  name: string
  grammar: LanguageFn
  /** Shiki's id, which is what the frame is rendered with. */
  id: BundledLanguage
  title: string
}

/**
 * What the picker offers and detection can return. Grammars are registered one
 * at a time rather than through the default bundle, which carries every
 * language highlight.js knows.
 */
export const languages: readonly Language[] = [
  { grammar: bash, id: 'bash', name: 'bash', title: 'Shell' },
  { grammar: c, id: 'c', name: 'c', title: 'C' },
  { grammar: cpp, id: 'cpp', name: 'cpp', title: 'C++' },
  { grammar: csharp, id: 'csharp', name: 'csharp', title: 'C#' },
  { grammar: css, id: 'css', name: 'css', title: 'CSS' },
  { grammar: go, id: 'go', name: 'go', title: 'Go' },
  { grammar: java, id: 'java', name: 'java', title: 'Java' },
  // JSX and TSX read plain JavaScript and TypeScript too, so the pair covers
  // the family without asking a snippet which dialect it is.
  { grammar: javascript, id: 'jsx', name: 'javascript', title: 'JavaScript' },
  { grammar: json, id: 'json', name: 'json', title: 'JSON' },
  { grammar: kotlin, id: 'kotlin', name: 'kotlin', title: 'Kotlin' },
  { grammar: markdown, id: 'markdown', name: 'markdown', title: 'Markdown' },
  { grammar: php, id: 'php', name: 'php', title: 'PHP' },
  { grammar: python, id: 'python', name: 'python', title: 'Python' },
  { grammar: ruby, id: 'ruby', name: 'ruby', title: 'Ruby' },
  { grammar: rust, id: 'rust', name: 'rust', title: 'Rust' },
  { grammar: sql, id: 'sql', name: 'sql', title: 'SQL' },
  { grammar: swift, id: 'swift', name: 'swift', title: 'Swift' },
  { grammar: typescript, id: 'tsx', name: 'typescript', title: 'TypeScript' },
  { grammar: xml, id: 'html', name: 'xml', title: 'HTML' },
  { grammar: yaml, id: 'yaml', name: 'yaml', title: 'YAML' },
]

const ids = new Map<string, BundledLanguage>()
for (const language of languages) {
  hljs.registerLanguage(language.name, language.grammar)
  ids.set(language.name, language.id)
}

/**
 * Highlight.js scores a guess by how much of a grammar it matched, so a line
 * or two of anything scores low. Under this the snippet is too slight to call.
 */
const confident = 6

/** Whether twoslash applies: only the TypeScript family carries types. */
export function typed(id: BundledLanguage): boolean {
  return id === 'tsx' || id === 'jsx'
}

/** The name shown for a language id. */
export function title(id: BundledLanguage): string {
  return languages.find((language) => language.id === id)?.title ?? id
}

/**
 * The language a snippet reads as, or nothing when the guess is too weak to
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
