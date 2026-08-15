import * as stylex from '@stylexjs/stylex'
import type { ComponentType, SVGProps } from 'react'
import AstroIcon from '~icons/simple-icons/astro'
import CIcon from '~icons/simple-icons/c'
import ClojureIcon from '~icons/simple-icons/clojure'
import CppIcon from '~icons/simple-icons/cplusplus'
import CrystalIcon from '~icons/simple-icons/crystal'
import CsharpIcon from '~icons/simple-icons/csharp'
import CssIcon from '~icons/simple-icons/css'
import DartIcon from '~icons/simple-icons/dart'
import DockerIcon from '~icons/simple-icons/docker'
import ElixirIcon from '~icons/simple-icons/elixir'
import ElmIcon from '~icons/simple-icons/elm'
import ErlangIcon from '~icons/simple-icons/erlang'
import GleamIcon from '~icons/simple-icons/gleam'
import BashIcon from '~icons/simple-icons/gnubash'
import GoIcon from '~icons/simple-icons/go'
import GraphqlIcon from '~icons/simple-icons/graphql'
import HaskellIcon from '~icons/simple-icons/haskell'
import HtmlIcon from '~icons/simple-icons/html5'
import JavascriptIcon from '~icons/simple-icons/javascript'
import JsonIcon from '~icons/simple-icons/json'
import JuliaIcon from '~icons/simple-icons/julia'
import KotlinIcon from '~icons/simple-icons/kotlin'
import TexIcon from '~icons/simple-icons/latex'
import LuaIcon from '~icons/simple-icons/lua'
import MarkdownIcon from '~icons/simple-icons/markdown'
import Neo4jIcon from '~icons/simple-icons/neo4j'
import NixIcon from '~icons/simple-icons/nixos'
import OcamlIcon from '~icons/simple-icons/ocaml'
import JavaIcon from '~icons/simple-icons/openjdk'
import PhpIcon from '~icons/simple-icons/php'
import PowershellIcon from '~icons/simple-icons/powershell'
import PrismaIcon from '~icons/simple-icons/prisma'
import PythonIcon from '~icons/simple-icons/python'
import RIcon from '~icons/simple-icons/r'
import ReactIcon from '~icons/simple-icons/react'
import RubyIcon from '~icons/simple-icons/ruby'
import RustIcon from '~icons/simple-icons/rust'
import SassIcon from '~icons/simple-icons/sass'
import ScalaIcon from '~icons/simple-icons/scala'
import SolidityIcon from '~icons/simple-icons/solidity'
import SqlIcon from '~icons/simple-icons/sqlite'
import SvelteIcon from '~icons/simple-icons/svelte'
import SwiftIcon from '~icons/simple-icons/swift'
import TerraformIcon from '~icons/simple-icons/terraform'
import TypescriptIcon from '~icons/simple-icons/typescript'
import VIcon from '~icons/simple-icons/v'
import VueIcon from '~icons/simple-icons/vuedotjs'
import XmlIcon from '~icons/simple-icons/xml'
import YamlIcon from '~icons/simple-icons/yaml'
import ZigIcon from '~icons/simple-icons/zig'

import * as detect from '#/lib/detect.js'
import { MenuSelect } from '#/ui/PaletteSelect.js'
import { color } from '../../theme/tokens.stylex.js'

const styles = stylex.create({
  icon: { color: color.onChromeSecondary, display: 'block', height: 16, width: 16 },
})

type Icon = ComponentType<SVGProps<SVGSVGElement>>

const icons: Partial<Record<detect.LanguageId, Icon>> = {
  astro: AstroIcon,
  bash: BashIcon,
  c: CIcon,
  clojure: ClojureIcon,
  console: BashIcon,
  cpp: CppIcon,
  crystal: CrystalIcon,
  csharp: CsharpIcon,
  css: CssIcon,
  cypher: Neo4jIcon,
  dart: DartIcon,
  dockerfile: DockerIcon,
  elixir: ElixirIcon,
  elm: ElmIcon,
  erlang: ErlangIcon,
  gleam: GleamIcon,
  go: GoIcon,
  graphql: GraphqlIcon,
  haskell: HaskellIcon,
  hcl: TerraformIcon,
  html: HtmlIcon,
  java: JavaIcon,
  javascript: JavascriptIcon,
  json: JsonIcon,
  jsx: ReactIcon,
  julia: JuliaIcon,
  kotlin: KotlinIcon,
  latex: TexIcon,
  lua: LuaIcon,
  markdown: MarkdownIcon,
  nix: NixIcon,
  ocaml: OcamlIcon,
  php: PhpIcon,
  powershell: PowershellIcon,
  prisma: PrismaIcon,
  python: PythonIcon,
  r: RIcon,
  ruby: RubyIcon,
  rust: RustIcon,
  scala: ScalaIcon,
  scss: SassIcon,
  solidity: SolidityIcon,
  sql: SqlIcon,
  svelte: SvelteIcon,
  swift: SwiftIcon,
  tsx: ReactIcon,
  typescript: TypescriptIcon,
  v: VIcon,
  vue: VueIcon,
  xml: XmlIcon,
  yaml: YamlIcon,
  zig: ZigIcon,
}

/** Language picker whose options carry a monochrome brand glyph. */
export function LanguageSelect(props: LanguageSelect.Props) {
  const automatic = detect.languages.find((language) => language.id === props.resolved)
  const items: readonly MenuSelect.Item<detect.LanguageId | 'auto'>[] = [
    {
      end: icon(props.resolved),
      label: `Auto (${automatic?.title ?? props.resolved})`,
      value: 'auto',
    },
    ...detect.languages.map((language) => ({
      end: icon(language.id),
      label: language.title,
      value: language.id,
    })),
  ]
  return (
    <MenuSelect
      aria-label="Language"
      items={items}
      onValueChange={props.onValueChange}
      value={props.value}
    />
  )
}

function icon(language: detect.LanguageId) {
  const Icon = icons[language]
  if (Icon) return <Icon aria-hidden {...stylex.props(styles.icon)} />
  return (
    <svg aria-hidden viewBox="0 0 16 16" {...stylex.props(styles.icon)}>
      <path
        d="m6 4-4 4 4 4m4-8 4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export declare namespace LanguageSelect {
  type Props = {
    /** Receives the selected language or automatic detection. */
    onValueChange: (value: detect.LanguageId | 'auto') => void
    /** Language currently resolved under automatic detection. */
    resolved: detect.LanguageId
    /** Selected language or automatic detection. */
    value: detect.LanguageId | 'auto'
  }
}
