import { cut, unchecked } from './Marks.js'

describe('unchecked', () => {
  test('blanks a line marked as removed, keeping every offset', () => {
    const code = 'const a = 1 // [!code --]\nconst a = 2 // [!code ++]\n'
    const blanked = unchecked(code)
    expect(blanked.length).toBe(code.length)
    expect(blanked).toMatchInlineSnapshot(`
      "                         
      const a = 2 // [!code ++]
      "
    `)
  })

  test('blanks what a notation standing alone addresses', () => {
    expect(unchecked('// [!code --:2]\nconst a = 1\nconst b = 2\nconst c = 3\n'))
      .toMatchInlineSnapshot(`
      "               
                 
                 
      const c = 3
      "
    `)
  })

  test('leaves a snippet marking nothing exactly as it was', () => {
    const code = 'const a = 1\n'
    expect(unchecked(code)).toBe(code)
  })
})

describe('cut', () => {
  test('takes the ranges out, whatever order they arrive in', () => {
    expect(
      cut('0123456789', [
        [6, 8],
        [2, 4],
      ]),
    ).toMatchInlineSnapshot(`"014589"`)
  })
})
