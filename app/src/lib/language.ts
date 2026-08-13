import type { BundledLanguage } from 'shiki'

/** A language the picker offers: Shiki's id against the name shown. */
type Language = { id: BundledLanguage; title: string }

/** Every language the frame can render. Grammar data loads after selection. */
export const list: readonly Language[] = [
  { id: 'astro', title: 'Astro' },
  { id: 'bash', title: 'Bash' },
  { id: 'c', title: 'C' },
  { id: 'csharp', title: 'C#' },
  { id: 'cpp', title: 'C++' },
  { id: 'clojure', title: 'Clojure' },
  { id: 'console', title: 'Console' },
  { id: 'crystal', title: 'Crystal' },
  { id: 'css', title: 'CSS' },
  { id: 'cypher', title: 'Cypher' },
  { id: 'dart', title: 'Dart' },
  { id: 'diff', title: 'Diff' },
  { id: 'dockerfile', title: 'Docker' },
  { id: 'elixir', title: 'Elixir' },
  { id: 'elm', title: 'Elm' },
  { id: 'erb', title: 'ERB' },
  { id: 'erlang', title: 'Erlang' },
  { id: 'gleam', title: 'Gleam' },
  { id: 'go', title: 'Go' },
  { id: 'graphql', title: 'GraphQL' },
  { id: 'haskell', title: 'Haskell' },
  { id: 'hcl', title: 'HCL' },
  { id: 'html', title: 'HTML' },
  { id: 'java', title: 'Java' },
  { id: 'javascript', title: 'JavaScript' },
  { id: 'json', title: 'JSON' },
  { id: 'jsx', title: 'JSX' },
  { id: 'julia', title: 'Julia' },
  { id: 'kotlin', title: 'Kotlin' },
  { id: 'latex', title: 'LaTeX' },
  { id: 'liquid', title: 'Liquid' },
  { id: 'lisp', title: 'Lisp' },
  { id: 'lua', title: 'Lua' },
  { id: 'markdown', title: 'Markdown' },
  { id: 'matlab', title: 'MATLAB' },
  { id: 'move', title: 'Move' },
  { id: 'nix', title: 'Nix' },
  { id: 'objc', title: 'Objective-C' },
  { id: 'ocaml', title: 'OCaml' },
  { id: 'php', title: 'PHP' },
  { id: 'powershell', title: 'Powershell' },
  { id: 'prisma', title: 'Prisma' },
  { id: 'python', title: 'Python' },
  { id: 'r', title: 'R' },
  { id: 'ruby', title: 'Ruby' },
  { id: 'rust', title: 'Rust' },
  { id: 'scala', title: 'Scala' },
  { id: 'scss', title: 'SCSS' },
  { id: 'solidity', title: 'Solidity' },
  { id: 'sql', title: 'SQL' },
  { id: 'svelte', title: 'Svelte' },
  { id: 'swift', title: 'Swift' },
  { id: 'toml', title: 'TOML' },
  { id: 'tsx', title: 'TSX' },
  { id: 'typescript', title: 'TypeScript' },
  { id: 'v', title: 'V' },
  { id: 'vue', title: 'Vue' },
  { id: 'xml', title: 'XML' },
  { id: 'yaml', title: 'YAML' },
  { id: 'zig', title: 'Zig' },
]

/** Whether Twoslash applies: only the TypeScript family carries types. */
export function typed(id: BundledLanguage): boolean {
  return id === 'javascript' || id === 'jsx' || id === 'tsx' || id === 'typescript'
}

/** The name shown for a language id. */
export function title(id: BundledLanguage): string {
  return list.find((language) => language.id === id)?.title ?? id
}
