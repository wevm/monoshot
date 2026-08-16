import { Switch as Base } from '@base-ui/react/switch'
import * as stylex from '@stylexjs/stylex'

import { color, motion, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  root: {
    backgroundColor: {
      default: color.grayAlpha500,
      ':is([data-checked])': color.gray1000,
    },
    borderStyle: 'none',
    borderRadius: 999,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
    display: 'inline-block',
    flexShrink: 0,
    height: 20,
    opacity: { default: 1, ':disabled': 0.5 },
    outline: 'none',
    padding: 0,
    position: 'relative',
    transitionDuration: motion.fast,
    transitionProperty: 'background-color',
    transitionTimingFunction: motion.inOut,
    width: 36,
  },
  thumb: {
    // Inverts with the track so the thumb keeps contrast in both states.
    backgroundColor: { default: color.onSolid, ':is([data-checked])': color.background },
    borderRadius: 999,
    boxShadow: shadow.thumb,
    display: 'block',
    height: 16,
    insetInlineStart: 2,
    position: 'absolute',
    top: 2,
    transform: { default: 'translateX(0)', ':is([data-checked])': 'translateX(16px)' },
    transitionDuration: motion.fast,
    transitionProperty: 'background-color, transform',
    transitionTimingFunction: motion.inOut,
    width: 16,
    '@media (prefers-reduced-motion: reduce)': {
      transitionProperty: 'background-color',
    },
  },
})

/** Toggle switch. State, keyboard behavior, and the hidden form input come from Base UI. */
export function Switch(props: Switch.Props) {
  const { style, ...rest } = props
  return (
    <Base.Root {...rest} {...stylex.props(styles.root, style)}>
      <Base.Thumb {...stylex.props(styles.thumb)} />
    </Base.Root>
  )
}

export declare namespace Switch {
  /** Props for {@link Switch}. Extends Base UI's switch root. */
  type Props = Omit<Base.Root.Props, 'className' | 'render' | 'style'> & {
    /** Styles merged onto the track. */
    style?: stylex.StyleXStyles | undefined
  }
}
