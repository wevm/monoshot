import * as stylex from '@stylexjs/stylex'

import { motion } from '../theme/tokens.stylex.js'

const spin = stylex.keyframes({ to: { transform: 'rotate(1turn)' } })

const styles = stylex.create({
  root: {
    animationDuration: motion.slow,
    animationIterationCount: 'infinite',
    animationName: spin,
    animationTimingFunction: 'linear',
    borderColor: 'currentColor',
    borderInlineEndColor: 'transparent',
    borderRadius: '50%',
    borderStyle: 'solid',
    borderWidth: 1.5,
    height: 14,
    width: 14,
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
})

/** Compact progress indicator that inherits the surrounding control color. */
export function Spinner() {
  return <span aria-hidden {...stylex.props(styles.root)} />
}
