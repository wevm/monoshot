import * as stylex from '@stylexjs/stylex'
import type { ComponentPropsWithoutRef } from 'react'

import { text } from '#/theme/text.js'
import { color, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  root: {
    backgroundColor: color.background,
    borderStyle: 'none',
    borderRadius: radius.control,
    boxShadow: {
      default: shadow.border,
      ':focus-visible': shadow.focusRing,
      ':focus': shadow.focusRing,
    },
    color: color.gray1000,
    outline: 'none',
    paddingInline: 10,
    width: '100%',
    '::placeholder': { color: color.gray900 },
  },
  small: { height: 32 },
  medium: { height: 40 },
  large: { height: 48 },
})

const sizes = { small: styles.small, medium: styles.medium, large: styles.large }
const typography = { small: text.copy13, medium: text.copy14, large: text.copy16 }

/** Text input in the Geist control family. Pair with a `<label>` or `aria-label`. */
export function Input(props: Input.Props) {
  const { size = 'medium', style, ...rest } = props
  return <input {...rest} {...stylex.props(styles.root, typography[size], sizes[size], style)} />
}

export declare namespace Input {
  type Props = Omit<ComponentPropsWithoutRef<'input'>, 'className' | 'size' | 'style'> & {
    size?: 'small' | 'medium' | 'large' | undefined
    style?: stylex.StyleXStyles | undefined
  }
}
