import * as stylex from '@stylexjs/stylex'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { color, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  root: {
    alignItems: 'center',
    borderStyle: 'none',
    borderRadius: radius.control,
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
    display: 'inline-flex',
    gap: 6,
    justifyContent: 'center',
    opacity: { default: 1, ':disabled': 0.5 },
    outline: 'none',
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    whiteSpace: 'nowrap',
  },
  primary: {
    // Hover and active shift by opacity so the ramp stays monotonic in both
    // schemes; stepping down the gray scale inverts direction in dark.
    backgroundColor: color.gray1000,
    color: color.background,
    opacity: { default: 1, ':hover:not(:disabled)': 0.85, ':active:not(:disabled)': 0.75 },
  },
  secondary: {
    backgroundColor: {
      default: color.background,
      ':hover:not(:disabled)': color.grayAlpha100,
      ':active:not(:disabled)': color.grayAlpha200,
      // Buttons that open a popup stay tinted while it is open.
      ':is([data-popup-open])': color.grayAlpha100,
    },
    boxShadow: { default: shadow.border, ':focus-visible': shadow.focusRing },
    color: color.gray1000,
  },
  tertiary: {
    backgroundColor: {
      default: 'transparent',
      ':hover:not(:disabled)': color.grayAlpha100,
      ':active:not(:disabled)': color.grayAlpha200,
      ':is([data-popup-open])': color.grayAlpha100,
    },
    color: color.gray1000,
  },
  danger: {
    backgroundColor: color.red800,
    color: color.onSolid,
    opacity: { default: 1, ':hover:not(:disabled)': 0.9, ':active:not(:disabled)': 0.8 },
  },
  small: { height: 32, paddingInline: 10 },
  medium: { height: 40, paddingInline: 14 },
  large: { height: 48, paddingInline: 18 },
  // Icon-only buttons stay square; the caller supplies an accessible name.
  squareSmall: { paddingInline: 0, width: 32 },
  squareMedium: { paddingInline: 0, width: 40 },
  squareLarge: { paddingInline: 0, width: 48 },
})

const sizes = { small: styles.small, medium: styles.medium, large: styles.large }
const squares = {
  small: styles.squareSmall,
  medium: styles.squareMedium,
  large: styles.squareLarge,
}
const variants = {
  primary: styles.primary,
  secondary: styles.secondary,
  tertiary: styles.tertiary,
  danger: styles.danger,
}
const typography = { small: text.button12, medium: text.button14, large: text.button16 }

/** Button in the Geist control family. `square` renders an icon-only button and requires an accessible name. */
export function Button(props: Button.Props) {
  const { children, size = 'medium', square, style, variant = 'secondary', ...rest } = props
  return (
    <button
      type="button"
      {...rest}
      {...stylex.props(
        styles.root,
        typography[size],
        variants[variant],
        sizes[size],
        square && squares[size],
        style,
      )}
    >
      {children}
    </button>
  )
}

export declare namespace Button {
  type Props = Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'style'> & {
    children?: ReactNode | undefined
    size?: 'small' | 'medium' | 'large' | undefined
    square?: boolean | undefined
    style?: stylex.StyleXStyles | readonly stylex.StyleXStyles[] | undefined
    variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | undefined
  }
}
