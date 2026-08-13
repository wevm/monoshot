const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$'
const values = new Map([...alphabet].map((character, index) => [character, index] as const))

/** Decompresses an lz-string URI component without exceeding the output limit. */
export function decompress(options: decompress.Options): string | undefined {
  const input = options.input.replaceAll(' ', '+')
  if (!input) return undefined

  let value = values.get(input[0] ?? '') ?? 0
  let position = 32
  let index = 1
  function read(width: number) {
    let result = 0
    let power = 1
    const maximum = 2 ** width
    while (power !== maximum) {
      const bit = value & position
      position >>= 1
      if (position === 0) {
        position = 32
        value = values.get(input[index++] ?? '') ?? 0
      }
      if (bit) result |= power
      power <<= 1
    }
    return result
  }

  const dictionary = ['', '', '']
  let size = 4
  let width = 3
  let remaining = 4
  const first = read(2)
  if (first === 2) return ''
  if (first !== 0 && first !== 1) return undefined
  let previous = String.fromCharCode(read(first === 0 ? 8 : 16))
  dictionary[3] = previous
  const result = [previous]
  let output = previous.length

  while (index <= input.length) {
    let code = read(width)
    if (code === 0 || code === 1) {
      dictionary[size++] = String.fromCharCode(read(code === 0 ? 8 : 16))
      code = size - 1
      remaining--
    } else if (code === 2) return result.join('')

    if (remaining === 0) {
      remaining = 2 ** width
      width++
    }
    const entry = dictionary[code] ?? (code === size ? previous + previous[0] : undefined)
    if (entry === undefined || output + entry.length > options.limit) return undefined
    result.push(entry)
    output += entry.length
    dictionary[size++] = previous + entry[0]
    previous = entry
    remaining--
    if (remaining === 0) {
      remaining = 2 ** width
      width++
    }
  }
  return undefined
}

export declare namespace decompress {
  type Options = {
    /** Encoded lz-string URI component. */
    input: string
    /** Maximum decoded UTF-16 code units. */
    limit: number
  }
}
