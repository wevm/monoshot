import { Menu as Base } from '@base-ui/react/menu'
import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { color, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  trigger: {
    alignItems: 'center',
    backgroundColor: {
      default: color.background,
      ':hover': color.grayAlpha100,
      ':is([data-popup-open])': color.grayAlpha100,
    },
    borderStyle: 'none',
    borderRadius: radius.control,
    boxShadow: { default: shadow.border, ':focus-visible': shadow.focusRing },
    color: color.gray1000,
    cursor: 'pointer',
    display: 'inline-flex',
    gap: 6,
    height: 40,
    justifyContent: 'center',
    outline: 'none',
    paddingInline: 14,
  },
  popup: {
    backgroundColor: color.background,
    borderRadius: radius.floating,
    boxShadow: shadow.menu,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 200,
    outline: 'none',
    padding: 4,
  },
  item: {
    alignItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':is([data-highlighted])': color.grayAlpha100,
    },
    borderRadius: radius.control,
    color: color.gray1000,
    cursor: 'pointer',
    display: 'flex',
    gap: 8,
    height: 32,
    justifyContent: 'space-between',
    outline: 'none',
    paddingInline: 8,
    userSelect: 'none',
  },
})

/** Dropdown menu. Focus management, typeahead, and dismissal come from Base UI. */
export function Menu(props: Menu.Props) {
  const { children, label, style } = props
  return (
    <Base.Root>
      <Base.Trigger {...stylex.props(styles.trigger, text.button14, style)}>{label}</Base.Trigger>
      <Base.Portal>
        <Base.Positioner align="end" side="bottom" sideOffset={6}>
          <Base.Popup {...stylex.props(styles.popup)}>{children}</Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  )
}

Menu.Item = function Item(props: Menu.Item.Props) {
  const { children, hint, ...rest } = props
  return (
    <Base.Item {...rest} {...stylex.props(styles.item, text.copy14)}>
      <span>{children}</span>
      {hint}
    </Base.Item>
  )
}

export declare namespace Menu {
  type Props = {
    children: ReactNode
    label: ReactNode
    style?: stylex.StyleXStyles | undefined
  }

  namespace Item {
    type Props = Omit<Base.Item.Props, 'className' | 'render' | 'style'> & {
      children: ReactNode
      hint?: ReactNode | undefined
    }
  }
}
