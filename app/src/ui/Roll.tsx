import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, motion as m } from 'motion/react'
import type { Transition } from 'motion/react'
import { useState } from 'react'

const styles = stylex.create({
  row: { display: 'flex', lineHeight: 1.4, overflow: 'hidden', position: 'relative' },
  // One cell per character; both the outgoing and incoming glyph share it, so
  // the row keeps its width while a character changes.
  cell: { display: 'grid', justifyItems: 'center', position: 'relative' },
  glyph: { gridArea: '1 / 1', whiteSpace: 'pre' },
})

/** Short and firm: the value should land, not float. */
const roll = { damping: 30, stiffness: 420, type: 'spring' } as const

/** Text that rolls to what it says next rather than being replaced by it. */
export function Roll(props: Roll.Props) {
  const { digits, style, transition = roll, up = true, value } = props
  const offset = up ? '-100%' : '100%'
  const from = up ? '100%' : '-100%'
  // Every change gets a fresh key, so a value returning while its predecessor
  // is still leaving enters as a new glyph from below instead of reversing the
  // one in flight. Digits keep their character as the key: an unchanged digit
  // has nothing to animate.
  const [seen, setSeen] = useState({ count: 0, value })
  if (seen.value !== value) setSeen({ count: seen.count + 1, value })
  return (
    <span {...stylex.props(styles.row, style)}>
      {(digits ? [...value] : [value]).map((character, index) => (
        // Position is the identity here: the character is the animating key.
        // eslint-disable-next-line react/no-array-index-key
        <span key={index} {...stylex.props(styles.cell)}>
          <AnimatePresence initial={false} mode="popLayout">
            <m.span
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: offset }}
              initial={{ opacity: 0, y: from }}
              key={digits ? character : `${character}-${seen.count}`}
              transition={transition}
              {...stylex.props(styles.glyph)}
            >
              {character}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}

export declare namespace Roll {
  /** Props for {@link Roll}. */
  type Props = {
    /** Rolls each character on its own, for values that read as a number. */
    digits?: boolean | undefined
    style?: stylex.StyleXStyles[] | undefined
    /** How the glyphs move. Firm with a little give by default. */
    transition?: Transition | undefined
    /** Direction the value rolls. Up by default, as a value advancing does. */
    up?: boolean | undefined
    value: string
  }
}
