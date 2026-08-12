import { Tooltip as Base } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import { MotionConfig, useReducedMotion } from 'motion/react'
import type { ReactElement, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { text } from '#/theme/text.js'
import { Roll } from './Roll.js'
import { color, font, motion, radius, shadow } from '../theme/tokens.stylex.js'

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
 * How the pill moves from the control it was over to the one it is over now.
 *
 * Its transform, which is where Base UI puts the pill, and inline because the
 * library writes `transition: none` there for the frame it mounts, which only a
 * style of its own outranks.
 */
const travel = `transform ${motion.fast} ${motion.inOut}`

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

/**
 * Takes the hint away shortly, unless something asks for it first.
 *
 * Once, rather than each time the pointer moves: a pointer travelling would
 * otherwise keep putting the moment off and the hint would ride along forever.
 */
function hideSoon() {
  if (hiding !== undefined) return
  hiding = setTimeout(() => {
    hiding = undefined
    aimAt(undefined)
  }, linger)
}

/** Calls that off, for a control asking about itself. */
function keep() {
  clearTimeout(hiding)
  hiding = undefined
}

/** Takes the hint away now, and forgets what it was about. */
function dismiss() {
  keep()
  pending = undefined
  aimAt(undefined)
}

/**
 * How long it holds on after being taken back.
 *
 * A pointer leaving one control for the next is off both for a moment, and a
 * hint that went in that moment would blink out and straight back in.
 */
const linger = 100

/**
 * How long a control is under the pointer before its hint answers.
 *
 * Long enough that crossing a control is not asking about it, short enough that
 * stopping on one does not feel like waiting.
 */
const hover = 100

/**
 * How long a control the pointer was dragging stands still before it counts as
 * having stopped.
 *
 * Longer than the wait for a control that never moved: a pointer sweeping gently
 * leaves gaps of its own between moves, and answering in one of those is
 * answering mid-sweep.
 */
const settled = 300

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
    // Out of the way while the pointer drags a control along: the strip follows
    // the pointer down the code, so sweeping it keeps one control underneath the
    // whole way and the hint rides along.
    //
    // Read off the control rather than off the pointer, since the pointer moves
    // in both cases: one going from one control to the next leaves them where
    // they are, and the hint travels between them instead.
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
      // Mounted outside the trees that set this, being the app's own rather than
      // any page's: without it the words roll for a reader who asked for stillness.
      <MotionConfig reducedMotion="user">
        <Wrapped />
        <Aimed />
      </MotionConfig>
    )
  }

  /**
   * Shares one delay across the tooltips inside. A row of swatches reads as one
   * row: once a hint has been waited for, the ones beside it answer at once.
   */
  export function Provider(props: { children: ReactNode }) {
    return <Base.Provider delay={hover}>{props.children}</Base.Provider>
  }

  /**
   * Points the hint at a control the app built itself, and at the words for it.
   * Called with nothing, the hint goes.
   *
   * For DOM the app writes rather than renders, which cannot carry a trigger:
   * the marks beside the code, and the pin on a type.
   */
  export function point(at?: Aim | undefined) {
    keep()
    pending = at
    if (!at) {
      hideSoon()
      return
    }
    // Once the pointer has stopped, since on its way it is passing this control
    // rather than asking about it. A hint already up answers at once: the wait
    // is for the first question, and the ones after it are the same question
    // moving along a row.
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
    <Base.Root
      open={aimed !== undefined}
      // Escape is Base UI's to answer, and it answers by asking for this: without
      // it the hint stays until a pointer happens to take it away.
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
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
  const still = useReducedMotion()
  // Held as state rather than a ref, so this runs when the pill is put on the
  // page: it is mounted by the library a commit or two after being asked for.
  const [standing, setStanding] = useState<HTMLElement | null>(null)
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    const node = standing
    if (!node) return
    // A pill being placed has no transform to move from, so moving it means
    // moving it out of the corner the page begins at. Once it stands somewhere,
    // every placement after that is a move between two controls. Told to move
    // after it has been placed rather than before, so the placement itself is
    // not something to animate.
    const settle = () => {
      // Base UI holds an unplaced pill at nothing until it knows where to put
      // it, whichever properties it ends up placing it with.
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
        <Base.Popup {...stylex.props(styles.popup, text.label13)}>
          <Roll transition={rolling} value={label} />
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  )
}
