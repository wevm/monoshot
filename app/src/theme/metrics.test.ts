import * as fs from 'node:fs'
import * as path from 'node:path'
import { Frame } from 'monoshot'

/**
 * The editor, the exported frame, and the standalone document lay out one
 * snippet, and `Frame.metrics` is what the library lays it out on. Two places
 * in the app restate those numbers rather than importing them: plain CSS cannot
 * read a module, and the StyleX compiler inlines `.stylex.ts` at build time
 * without resolving imported values. This is what keeps all three equal.
 *
 * Read as source rather than imported: `tokens.stylex.ts` throws outside the
 * babel plugin that compiles it.
 */
function read(file: string): string {
  return fs.readFileSync(path.join(import.meta.dirname, file), 'utf8')
}

/** A declared value, by the name it is declared against, stripped of `px`. */
function declared(source: string, name: string): string {
  const found = new RegExp(`(?:^|[^\\w-])${name}:\\s*'?([^;,'\\n]+)'?`).exec(source)
  if (!found?.[1]) throw new Error(`\`${name}\` is not declared.`)
  return found[1].trim().replace(/px$/, '')
}

describe('code metrics', () => {
  test('the StyleX consts match the metrics a frame is laid out on', () => {
    const source = read('tokens.stylex.ts').split('export const code =')[1] ?? ''
    expect({
      line: declared(source, 'line'),
      padding: declared(source, 'padding'),
      size: declared(source, 'size'),
      tab: declared(source, 'tab'),
    }).toEqual({
      line: String(Frame.metrics.code.line),
      padding: String(Frame.metrics.source.padding),
      size: String(Frame.metrics.code.size),
      tab: String(Frame.metrics.code.tab),
    })
  })

  test('the editor stylesheet matches the metrics a frame is laid out on', () => {
    const source = read('../styles.css')
    expect({
      annotation: declared(source, '--code-annotation-size'),
      inset: declared(source, '--editor-inset'),
      line: declared(source, '--code-line-height'),
      size: declared(source, '--code-font-size'),
      tab: declared(source, '--code-tab-size'),
    }).toEqual({
      annotation: String(Frame.metrics.annotation.size),
      inset: String(Frame.metrics.body.inset),
      line: String(Frame.metrics.code.line),
      size: String(Frame.metrics.code.size),
      tab: String(Frame.metrics.code.tab),
    })
  })
})
