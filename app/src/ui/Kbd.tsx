import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { color, font, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  root: {
    alignItems: 'center',
    backgroundColor: color.background,
    borderRadius: 4,
    boxShadow: shadow.border,
    color: color.gray900,
    display: 'inline-flex',
    fontFamily: font.sans,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingInline: 5,
  },
})

/** Keyboard shortcut hint. */
export function Kbd(props: Kbd.Props) {
  return <kbd {...stylex.props(styles.root, text.label12, props.style)}>{props.children}</kbd>
}

export declare namespace Kbd {
  type Props = {
    children: ReactNode
    style?: stylex.StyleXStyles | undefined
  }
}
