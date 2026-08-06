import { Switch as Base } from '@base-ui/react/switch'
import * as stylex from '@stylexjs/stylex'

import { color, shadow } from '../theme/tokens.stylex.js'

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
    width: 36,
  },
  thumb: {
    // Inverts with the track so the thumb keeps contrast in both states.
    backgroundColor: { default: '#fff', ':is([data-checked])': color.background },
    borderRadius: 999,
    boxShadow: '0 1px 2px #00000029',
    display: 'block',
    height: 16,
    insetInlineStart: { default: 2, ':is([data-checked])': 18 },
    position: 'absolute',
    top: 2,
    width: 16,
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
  type Props = Omit<Base.Root.Props, 'className' | 'render' | 'style'> & {
    style?: stylex.StyleXStyles | undefined
  }
}
