import * as stylex from '@stylexjs/stylex'
import type { ComponentPropsWithoutRef } from 'react'

import { text } from '#/theme/text.js'
import { color, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  root: {
    appearance: 'none',
    backgroundColor: color.background,
    borderStyle: 'none',
    borderRadius: radius.control,
    boxShadow: { default: shadow.border, ':focus-visible': shadow.focusRing },
    color: color.gray1000,
    cursor: 'pointer',
    outline: 'none',
    paddingInlineEnd: 28,
    paddingInlineStart: 10,
  },
  // A background image rather than a mask: masking a `select` clips the whole
  // control. The stroke matches gray700, which is identical in both schemes.
  chevron: {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%238f8f8f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 8px center',
    backgroundRepeat: 'no-repeat',
  },
  small: { height: 32 },
  medium: { height: 40 },
  large: { height: 48 },
})

const sizes = { small: styles.small, medium: styles.medium, large: styles.large }
const typography = { small: text.copy13, medium: text.copy14, large: text.copy16 }

/** Native select styled to the Geist control family. Pair with a `<label>` or `aria-label`. */
export function Select(props: Select.Props) {
  const { children, size = 'medium', style, ...rest } = props
  return (
    <select
      {...rest}
      {...stylex.props(styles.root, styles.chevron, typography[size], sizes[size], style)}
    >
      {children}
    </select>
  )
}

export declare namespace Select {
  /** Props for {@link Select}. Extends the native select element. */
  type Props = Omit<ComponentPropsWithoutRef<'select'>, 'className' | 'size' | 'style'> & {
    /** Control height: 32, 40, or 48 pixels. @default 'medium' */
    size?: 'small' | 'medium' | 'large' | undefined
    /** Styles merged onto the root. */
    style?: stylex.StyleXStyles | undefined
  }
}
