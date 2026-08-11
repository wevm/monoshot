import { Tooltip as Base } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import { text } from '#/theme/text.js'
import { Roll } from './Roll.js'
import { color, font, radius, shadow } from '../theme/tokens.stylex.js'

/**
 * The one tooltip every hint is drawn in, so moving from one control to the next
 * carries the words across rather than blinking a new pill out and back.
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
 * The hint rolling to what it says next.
 *
 * Without give: a hint is read rather than played with, and a name that settles
 * by rocking into place is a name that cannot be read until it stops.
 */
const rolling = { bounce: 0, duration: 0.22, type: 'spring' } as const

/** A hint pointed at a control the app draws rather than renders. */
type Aim = { at: Element; label: string }

let aim: Aim | undefined
let pending: Aim | undefined
let resting = true
let waiting: ReturnType<typeof setTimeout> | undefined
let settling: ReturnType<typeof setTimeout> | undefined
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

/**
 * How long it holds on after being taken back.
 *
 * A pointer leaving one control for the next is off both for a moment, and a
 * hint that went in that moment would blink out and straight back in.
 */
const linger = 100

/** How long the pointer stands still before it counts as having stopped. */
const rest = 120

/**
 * Watches the pointer, so a hint answers what it came to rest on rather than
 * everything it passed on the way.
 *
 * The marks sit beside the code and the strip follows the pointer down it, so a
 * pointer on its way somewhere sweeps control after control.
 */
function pace() {
  const moved = () => {
    resting = false
    clearTimeout(settling)
    // Out of the way while the pointer is going somewhere.
    if (aim) aimAt(undefined)
    settling = setTimeout(() => {
      resting = true
      if (pending) aimAt(pending)
    }, rest)
  }
  window.addEventListener('pointermove', moved, { passive: true })
  return () => window.removeEventListener('pointermove', moved)
}

/**
 * Hover and focus tooltip around a single focusable child. Reaches the one
 * {@link Tooltip.Surface} the app mounts, so every hint is the same pill.
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
    pending = at
    if (!at) {
      waiting = setTimeout(() => aimAt(undefined), linger)
      return
    }
    // Only once the pointer has stopped: on its way it is passing this control
    // rather than asking about it.
    if (resting) aimAt(at)
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
  return <Base.Root handle={shared}>{({ payload }) => <Pill label={payload ?? ''} />}</Base.Root>
}

/** The hint for whatever {@link Tooltip.point} was last pointed at. */
function Aimed() {
  useEffect(pace, [])
  const aimed = useSyncExternalStore(
    watch,
    () => aim,
    () => undefined,
  )
  // Held while it goes: a pill with nothing to be anchored to is placed at the
  // page's own corner, which is where it would be drawn as it left.
  const last = useRef<Aim | undefined>(undefined)
  if (aimed) last.current = aimed
  const shown = aimed ?? last.current
  // Where the control is rather than the control itself, so the last place it
  // stood outlives it: the marks beside the code are taken out from under the
  // pointer, and a control off the page measures at the page's corner.
  const anchor = useMemo(() => {
    const at = shown?.at
    if (!at) return undefined
    const stood = at.getBoundingClientRect()
    return { getBoundingClientRect: () => (at.isConnected ? at.getBoundingClientRect() : stood) }
  }, [shown])
  return (
    <Base.Root open={aimed !== undefined}>
      <Pill anchor={anchor} label={shown?.label ?? ''} />
    </Base.Root>
  )
}

/**
 * What a hint is drawn as, wherever it was asked for.
 *
 * Nothing animates where it is. Base UI holds a pill at the page's corner until
 * it has worked out where to put it, and that lands whenever it lands: a pill
 * that moves under its own steam sets off from the corner often enough to be the
 * thing you notice about it. It appears where it belongs, and its words are what
 * move.
 */
function Pill(props: {
  anchor?: Element | { getBoundingClientRect: () => DOMRect } | undefined
  label: string
}) {
  const { anchor, label } = props
  return (
    <Base.Portal>
      <Base.Positioner
        anchor={anchor}
        side="top"
        sideOffset={6}
        {...stylex.props(styles.positioner)}
      >
        <Base.Popup {...stylex.props(styles.popup, text.label13)}>
          <Roll transition={rolling} value={label} />
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  )
}
