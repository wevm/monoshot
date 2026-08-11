import type { ShikiTransformer } from 'shiki'

/** The code element a transformer is handed, and what it may hold. */
type Element = Parameters<NonNullable<ShikiTransformer['code']>>[0]
type Content = Element['children'][number]

/**
 * The tags a snippet can carry beside its code, each drawing a line of prose
 * of its own.
 *
 * Shared with every resolver: a tag the compiler was not told about stays an
 * ordinary comment in what is drawn.
 */
export const tags = ['annotate', 'error', 'log', 'warn'] as const

/** A tag comment: what names it, and where the prose it carries begins. */
const written = new RegExp(`^[ \\t]*(?://|#|--|;|%|/\\*|<!--)[ \\t]*@(${tags.join('|')}):[ \\t]?`)

/** How a block comment ends, which a tag written in one carries. */
const closing = /[ \t]*(?:\*\/|-->)[ \t]*$/

/**
 * Draws the tags a snippet carries as rows of prose, the way a resolved run
 * would draw them.
 *
 * A tag is a mark the snippet carries rather than something a compiler found,
 * so it is drawn whatever the snippet is written in: without this, a tag in a
 * language no compiler reads stays an ordinary comment.
 */
export function transformer(): ShikiTransformer {
  return {
    code(node) {
      for (const [index, child] of node.children.entries()) {
        if (child.type !== 'element') continue
        const line = prose(child)
        const found = written.exec(line)
        if (!found) continue
        node.children[index] = row(
          found[1] as string,
          line.slice(found[0].length).replace(closing, ''),
        )
      }
    },
    name: 'monoshot:tags',
  }
}

/** A row of prose, in the markup the rich twoslash renderer draws one as. */
function row(name: string, text: string): Content {
  return {
    children: [{ type: 'text', value: text }],
    properties: { class: `twoslash-tag-line twoslash-tag-${name}-line` },
    tagName: 'div',
    type: 'element',
  }
}

/** What a line says, read off the tokens it was drawn as. */
function prose(node: Content | Element): string {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return ''
  return node.children.map(prose).join('')
}
