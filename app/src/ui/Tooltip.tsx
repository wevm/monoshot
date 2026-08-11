import { Tooltip as Base } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import { useReducedMotion } from 'motion/react'
import type { ReactElement } from 'react'

import { text } from '#/theme/text.js'
import { color, font, motion, radius, shadow } from '../theme/tokens.stylex.js'

/**
 * The one tooltip every hint is drawn in, which is what lets a hint travel from
 * the control it was about to the next one asked about rather than blink out and
 * back a few pixels over.
 */
const shared = Base.createHandle<string>()

const styles = stylex.create({
  // Over whatever it is about, including the surfaces that float: a hint about a
  // control inside a popover is drawn on top of the popover.
  positioner: { zIndex: 20 },
  popup: {
    backgroundColor: color.background,
    borderRadius: radius.control,
    boxShadow: shadow.tooltip,
    color: color.gray1000,
    // The portal lands under `body`, outside the element that sets the font.
    fontFamily: font.mono,
    // What the viewport measured the hint it is showing to be, so a longer name
    // opens the pill out rather than snapping it wider.
    height: 'var(--popup-height)',
    paddingBlock: 4,
    paddingInline: 8,
    transitionDuration: motion.fast,
    transitionProperty: 'height, width',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
    width: 'var(--popup-width)',
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0s' },
  },
})

/**
 * How the pill travels from the control it was over to the one it is over now.
 *
 * The placement itself, since that is what Base UI writes, and inline because it
 * writes `transition: none` there for the frame the pill mounts. Only a style of
 * its own outranks that, and the library reads the transition to decide which
 * edge to hold the pill by: without one it anchors the first placement by `top`
 * and every later one by `bottom`, leaving the first move with nothing to
 * interpolate.
 */
const travel = ['bottom', 'left', 'right', 'top']
  .map((side) => `${side} ${motion.fast} ${motion.out}`)
  .join(', ')

/**
 * Hover and focus tooltip around a single focusable child. Reaches the one
 * {@link Tooltip.Surface} the app mounts, so every hint is the same pill moving.
 *
 * Base UI does not expose the popup text to assistive technology, so the child
 * still needs its own accessible name; treat the tooltip as a sighted-user hint.
 */
export function Tooltip(props: Tooltip.Props) {
  const { children, label } = props
  return <Base.Trigger handle={shared} payload={label} render={children} />
}

export namespace Tooltip {
  /**
   * The pill itself, mounted once for the whole app inside a {@link
   * Tooltip.Provider}.
   */
  export function Surface() {
    const still = useReducedMotion()
    return (
      <Base.Root handle={shared}>
        {({ payload }) => (
          <Base.Portal>
            <Base.Positioner
              side="top"
              sideOffset={6}
              style={{ transition: still ? 'none' : travel }}
              {...stylex.props(styles.positioner)}
            >
              <Base.Popup {...stylex.props(styles.popup, text.label13)}>
                {/* Styled in `styles.css`: the swap it draws is between two
                    containers of its own, which no rule here can reach. */}
                <Base.Viewport className="tooltip-viewport">{payload}</Base.Viewport>
              </Base.Popup>
            </Base.Positioner>
          </Base.Portal>
        )}
      </Base.Root>
    )
  }

  /**
   * Shares one delay across the tooltips inside. A row of swatches reads as one
   * row: once a hint has been waited for, the ones beside it answer at once.
   */
  export const Provider = Base.Provider

  /** Props for {@link Tooltip}. */
  export type Props = {
    /** The focusable control the tooltip describes. */
    children: ReactElement
    /** Hint text shown on hover and focus. */
    label: string
  }
}
