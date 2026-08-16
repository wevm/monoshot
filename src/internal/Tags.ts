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

/** Whether a source line becomes a prose annotation row. */
export function tagged(line: string): boolean {
  return written.test(line)
}

/**
 * Draws the tags a snippet carries as rows of prose, the way a resolved run
 * would draw them.
 *
 * Tags are source annotations rather than compiler output, so the transformer
 * renders them for every supported source language.
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

/** Returns the text content represented by a rendered line. */
function prose(node: Content | Element): string {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return ''
  return node.children.map(prose).join('')
}
