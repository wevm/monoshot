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

test('counts only as far as there are lines to count', () => {
  // A count of its own making rather than the snippet's: one asking for a
  // billion lines, and one asking for so many that the number reads as
  // infinite, both stop at the end of the code.
  expect(unchecked('const a = 1 // [!code --:1000000000]\nconst b = 2')).toMatchInlineSnapshot(`
      "                                    
                 "
    `)
  expect(unchecked('const a = 1 // [!code --:999999999999999999999]\nconst b = 2'))
    .toMatchInlineSnapshot(`
      "                                               
      const b = 2"
    `)
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
