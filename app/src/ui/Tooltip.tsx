import { Tooltip as Base } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import { motion as m, useReducedMotion } from 'motion/react'
import type { ReactElement } from 'react'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { text } from '#/theme/text.js'
import { Roll } from './Roll.js'
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
    paddingBlock: 4,
    paddingInline: 8,
    whiteSpace: 'nowrap',
  },
})

/**
 * How the pill travels from the control it was over to the one it is over now.
 *
 * Its transform, which is where Base UI puts the pill, and inline because the
 * library writes `transition: none` there for the frame it mounts, which only a
 * style of its own outranks.
 */
const travel = `transform ${motion.fast} ${motion.out}`

/**
 * The same, over no time worth seeing, for the frame the pill is first placed in.
 *
 * A pill opening has nowhere to travel from: it is put where it belongs, and
 * without this it would arrive there from the corner of the page. Written rather
 * than left out, since the library reads the transition to decide how to hold the
 * pill, and holding it one way to open and another to travel is a jump.
 */
const placing = `transform 1ms linear`

/**
 * The pill taking the width of what it says next, and the hint rolling to it.
 *
 * Without give: a hint is read rather than played with, and a name that settles
 * by rocking into place is a name that cannot be read until it stops.
 */
const morph = { bounce: 0, duration: 0.22, type: 'spring' } as const

/** A hint pointed at a control the app draws rather than renders. */
type Aim = { at: Element; label: string }

let aim: Aim | undefined
let waiting: ReturnType<typeof setTimeout> | undefined
const watching = new Set<() => void>()

function watch(watcher: () => void) {
  watching.add(watcher)
  return () => {
    watching.delete(watcher)
  }
}

function aimAt(at: Aim | undefined) {
  aim = at
  for (const watcher of watching) watcher()
}

/** How long a hint waits before answering, as the wrapped ones wait. */
const wait = 300

/**
 * How long it holds on after being taken back.
 *
 * A pointer leaving one control for the next is off both for a moment, and a
 * hint that went in that moment would blink out and back rather than travel.
 */
const linger = 100

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
   * The pill, mounted once for the whole app inside a {@link Tooltip.Provider}.
   *
   * Two of them: one for the controls the app renders, and one for the controls
   * it builds itself, which have no element for a trigger to wrap.
   */
  export function Surface() {
    return (
      <>
        <Wrapped />
        <Aimed />
      </>
    )
  }

  /**
   * Shares one delay across the tooltips inside. A row of swatches reads as one
   * row: once a hint has been waited for, the ones beside it answer at once.
   */
  export const Provider = Base.Provider

  /**
   * Points the hint at a control the app built itself, and at the words for it.
   * Called with nothing, the hint goes.
   *
   * For DOM the app writes rather than renders, which cannot carry a trigger:
   * the marks beside the code, and the pin on a type.
   */
  export function point(at?: Aim | undefined) {
    clearTimeout(waiting)
    if (!at) {
      waiting = setTimeout(() => aimAt(undefined), linger)
      return
    }
    // Already answering, so this is the hint moving rather than a new one: it
    // travels to the control now asking, and waits again only once it has gone.
    if (aim) {
      aimAt(at)
      return
    }
    waiting = setTimeout(() => aimAt(at), wait)
  }

  /** Props for {@link Tooltip}. */
  export type Props = {
    /** The focusable control the tooltip describes. */
    children: ReactElement
    /** Hint text shown on hover and focus. */
    label: string
  }
}

/** The hint for whatever a {@link Tooltip} wraps. */
function Wrapped() {
  const [open, setOpen] = useState(false)
  return (
    <Base.Root handle={shared} onOpenChange={setOpen}>
      {({ payload }) => <Pill label={payload ?? ''} open={open} />}
    </Base.Root>
  )
}

/** The hint for whatever {@link Tooltip.point} was last pointed at. */
function Aimed() {
  const aimed = useSyncExternalStore(
    watch,
    () => aim,
    () => undefined,
  )
  return (
    <Base.Root open={aimed !== undefined}>
      <Pill anchor={aimed?.at} label={aimed?.label ?? ''} open={aimed !== undefined} />
    </Base.Root>
  )
}

/** What a hint is drawn as, wherever it was asked for. */
function Pill(props: { anchor?: Element | undefined; label: string; open: boolean }) {
  const { anchor, label, open } = props
  const still = useReducedMotion()
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    if (!open) return
    let corrected = 0
    // Two frames after opening: one places the pill, and the next corrects that
    // placement once the pill has been measured. Travelling from here is
    // travelling between controls rather than into the first one.
    const frame = requestAnimationFrame(() => {
      corrected = requestAnimationFrame(() => setPlaced(true))
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(corrected)
      setPlaced(false)
    }
  }, [open])
  return (
    <Base.Portal>
      <Base.Positioner
        anchor={anchor}
        side="top"
        sideOffset={6}
        style={{ transition: still ? 'none' : placed ? travel : placing }}
        {...stylex.props(styles.positioner)}
      >
        {/*
         * The hint rolls rather than being drawn by a `Tooltip.Viewport`, which
         * animates between two of its own containers: it takes the pill out of
         * the flow to do that, leaving the positioner with no size until it has
         * been measured, so the first placement is computed for a box of nothing
         * and corrected a frame later. The correction is a pill sliding in from
         * beside the control.
         *
         * Size only, since where the pill is belongs to the placement above.
         */}
        <Base.Popup
          render={<m.div layout="size" transition={morph} />}
          {...stylex.props(styles.popup, text.label13)}
        >
          <Roll transition={morph} value={label} />
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  )
}
