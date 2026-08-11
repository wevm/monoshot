import { Tooltip as Base } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import type { ReactElement } from 'react'
import { useState } from 'react'

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
  // Set once it stands somewhere, so it is placed where it opens and travels
  // only from one control to another.
  travelling: {
    transitionDuration: motion.fast,
    transitionProperty: 'transform',
    transitionTimingFunction: motion.out,
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0s' },
  },
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
    const [travelling, setTravelling] = useState(false)
    return (
      <Base.Root
        handle={shared}
        onOpenChange={(open) => {
          if (!open) setTravelling(false)
        }}
        onOpenChangeComplete={setTravelling}
      >
        {({ payload }) => (
          <Base.Portal>
            <Base.Positioner
              side="top"
              sideOffset={6}
              {...stylex.props(styles.positioner, travelling && styles.travelling)}
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
