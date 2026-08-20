import type { ShikiTransformer } from 'shiki'

/** The code element a transformer is handed, and what it may hold. */
type Element = Parameters<NonNullable<ShikiTransformer['code']>>[0]
type Content = Element['children'][number]

/**
 * Tags that render source comments as annotation rows. Every resolver uses this
 * list so supported tags never remain ordinary comments.
 */
export const tags = ['annotate', 'error', 'log', 'warn'] as const

/** Matches a tag name and the start of its annotation text. */
const written = new RegExp(`^[ \\t]*(?://|#|--|;|%|/\\*|<!--)[ \\t]*@(${tags.join('|')}):[ \\t]?`)

/** Optional block-comment terminator after annotation text. */
const closing = /[ \t]*(?:\*\/|-->)[ \t]*$/

/** Whether a source line becomes a prose annotation row. */
export function tagged(line: string): boolean {
  return written.test(line)
}

/**
 * Converts tag comments into annotation rows. Tags are source annotations, so
 * this transformer runs for every supported language.
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

/** Builds annotation markup compatible with the Twoslash renderer. */
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
