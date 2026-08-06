/** Default snippet. Carries a type query so twoslash has something to annotate later. */
export const sample = `import { createHighlighter } from 'shiki'

const highlighter = await createHighlighter({
  langs: ['tsx'],
  themes: ['vitesse-dark'],
})

const html = highlighter.codeToHtml('const a = 1', {
  lang: 'tsx',
  theme: 'vitesse-dark',
})

html
// ^?
`
