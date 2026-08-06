import { Tooltip as Base } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { color, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  trigger: { display: 'inline-flex' },
  popup: {
    backgroundColor: color.background,
    borderRadius: radius.control,
    boxShadow: shadow.tooltip,
    color: color.gray1000,
    paddingBlock: 4,
    paddingInline: 8,
    whiteSpace: 'nowrap',
  },
})

/** Hover and focus tooltip. Positioning, delay, and `aria-describedby` wiring come from Base UI. */
export function Tooltip(props: Tooltip.Props) {
  const { children, label, style } = props
  return (
    <Base.Provider>
      <Base.Root>
        <Base.Trigger render={<span />} {...stylex.props(styles.trigger, style)}>
          {children}
        </Base.Trigger>
        <Base.Portal>
          <Base.Positioner side="top" sideOffset={6}>
            <Base.Popup {...stylex.props(styles.popup, text.label13)}>{label}</Base.Popup>
          </Base.Positioner>
        </Base.Portal>
      </Base.Root>
    </Base.Provider>
  )
}

export declare namespace Tooltip {
  type Props = {
    children: ReactNode
    label: string
    style?: stylex.StyleXStyles | undefined
  }
}
