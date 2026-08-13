import { Tooltip as Base } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import { MotionConfig, useReducedMotion } from 'motion/react'
import type { ReactElement, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { text } from '#/theme/text.js'
import { color, font, motion, radius, shadow } from '../theme/tokens.stylex.js'

/** Shared tooltip handle that reuses one popup across controls. */
const shared = Base.createHandle<string>()

const styles = stylex.create({
  // Keep tooltips above floating surfaces such as popovers.
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

/** Transition between tooltip anchors, applied inline to override Base UI. */
const travel = `transform ${motion.fast} ${motion.inOut}`

/** A tooltip target created through an imperative DOM API. */
type Aim = { at: Element; label: string }

let aim: Aim | undefined
let pending: Aim | undefined
let resting = true
let hiding: ReturnType<typeof setTimeout> | undefined
let stood: number | undefined
let dragged = false
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
  stood = undefined
  for (const watcher of watching) watcher()
}

/** Schedules dismissal unless another control cancels it. */
function hideSoon() {
  if (hiding !== undefined) return
  hiding = setTimeout(() => {
    hiding = undefined
    aimAt(undefined)
  }, linger)
}

/** Cancels a scheduled dismissal. */
function keep() {
  clearTimeout(hiding)
  hiding = undefined
}

/** Closes the tooltip and clears its pending target. */
function dismiss() {
  keep()
  pending = undefined
  aimAt(undefined)
}

/** Delay that preserves a tooltip while the pointer crosses between controls. */
const linger = 100

/** Initial pointer dwell before a tooltip opens. */
const hover = 100

/** Dwell required after a dragged control stops moving. */
const settled = 300

/** Tracks pointer motion and suppresses tooltips while controls move. */
function pace() {
  const moved = () => {
    resting = false
    clearTimeout(settling)
    // Compare target positions to distinguish a moving control from pointer
    // movement between stationary controls.
    if (aim) {
      const top = aim.at.getBoundingClientRect().top
      if (stood !== undefined && Math.abs(top - stood) > 0.5) {
        dragged = true
        hideSoon()
      }
      stood = top
    }
    settling = setTimeout(
      () => {
        resting = true
        dragged = false
        if (pending) aimAt(pending)
      },
      dragged ? settled : hover,
    )
  }
  window.addEventListener('pointermove', moved, { passive: true })
  return () => window.removeEventListener('pointermove', moved)
}

/**
 * Adds a hover and focus tooltip to one focusable child.
 * Base UI does not expose popup text to assistive technology, so the child still requires an accessible name.
 */
export function Tooltip(props: Tooltip.Props) {
  const { children, label } = props
  return <Base.Trigger handle={shared} payload={label} render={children} />
}

export namespace Tooltip {
  /** Mounts shared tooltip surfaces for React triggers and imperative DOM targets. */
  export function Surface() {
    return (
      // Honor the user's reduced-motion preference outside route-level providers.
      <MotionConfig reducedMotion="user">
        <Wrapped />
        <Aimed />
      </MotionConfig>
    )
  }

  /** Shares the opening delay so adjacent triggers open immediately after the first. */
  export function Provider(props: { children: ReactNode }) {
    return <Base.Provider delay={hover}>{props.children}</Base.Provider>
  }

  /** Targets the imperative tooltip, or schedules dismissal when `at` is undefined. */
  export function point(at?: Aim | undefined) {
    keep()
    pending = at
    if (!at) {
      hideSoon()
      return
    }
    // Require an initial dwell, then update an open tooltip immediately for
    // adjacent controls.
    if (resting || aim) aimAt(at)
  }

  /** Props for {@link Tooltip}. */
  export type Props = {
    /** The focusable control the tooltip describes. */
    children: ReactElement
    /** Hint text shown on hover and focus. */
    label: string
  }
}

/** Renders the tooltip for a {@link Tooltip} trigger. */
function Wrapped() {
  return <Base.Root handle={shared}>{({ payload }) => <Pill label={payload ?? ''} />}</Base.Root>
}

/** Renders the tooltip for the latest {@link Tooltip.point} target. */
function Aimed() {
  useEffect(pace, [])
  const aimed = useSyncExternalStore(
    watch,
    () => aim,
    () => undefined,
  )
  // Retain the last target while the closing transition completes.
  const last = useRef<Aim | undefined>(undefined)
  if (aimed) last.current = aimed
  const shown = aimed ?? last.current
  // Preserve the last measured position when an imperative control is removed.
  const anchor = useMemo(() => {
    const at = shown?.at
    if (!at) return undefined
    const stood = at.getBoundingClientRect()
    return { getBoundingClientRect: () => (at.isConnected ? at.getBoundingClientRect() : stood) }
  }, [shown])
  return (
    <Base.Root
      open={aimed !== undefined}
      // Synchronize dismissals initiated by Base UI, including Escape.
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <Pill anchor={anchor} label={shown?.label ?? ''} />
    </Base.Root>
  )
}

/**
 * Renders tooltip content and transitions between established anchor positions.
 * Initial placement does not animate because Base UI first positions the popup at the viewport origin.
 */
function Pill(props: {
  anchor?: Element | { getBoundingClientRect: () => DOMRect } | undefined
  label: string
}) {
  const { anchor, label } = props
  const still = useReducedMotion()
  // State triggers placement tracking when Base UI mounts the popup.
  const [standing, setStanding] = useState<HTMLElement | null>(null)
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    const node = standing
    if (!node) return
    // Enable position transitions only after Base UI completes initial placement.
    const settle = () => {
      // Base UI keeps the popup transparent until placement completes.
      if (node.style.opacity === '0') return
      watcher.disconnect()
      setPlaced(true)
    }
    const watcher = new MutationObserver(settle)
    watcher.observe(node, { attributeFilter: ['style'] })
    settle()
    return () => {
      watcher.disconnect()
      setPlaced(false)
    }
  }, [standing])
  return (
    <Base.Portal>
      <Base.Positioner
        anchor={anchor}
        ref={setStanding}
        side="top"
        sideOffset={6}
        style={{ transition: still || !placed ? 'none' : travel }}
        {...stylex.props(styles.positioner)}
      >
        <Base.Popup {...stylex.props(styles.popup, text.label13)}>{label}</Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  )
}
