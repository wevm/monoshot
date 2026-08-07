/**
 * Stands in for the twoslash engine: the type each identifier in the sample
 * resolves to. The engine will supply these per position rather than per name,
 * already broken across lines the way the language service returns them.
 */
export const types: Record<string, string> = {
  codeToHtml: `(method) Highlighter.codeToHtml(
  code: string,
  options: CodeToHastOptions<BundledLanguage, BundledTheme>
): string`,
  createHighlighter: `function createHighlighter(
  options: CreateHighlighterOptions
): Promise<Highlighter>`,
  highlighter: 'const highlighter: Highlighter',
  html: 'const html: string',
  lang: '(property) lang?: BundledLanguage',
  langs: `(property) langs?: (
  | BundledLanguage
  | LanguageRegistration
)[]`,
  theme: '(property) theme?: BundledTheme',
  themes: `(property) themes?: (
  | BundledTheme
  | ThemeRegistration
)[]`,
}
