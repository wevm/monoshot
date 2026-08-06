import { Menu as Base } from '@base-ui/react/menu'
import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { Button } from './Button.js'
import { color, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
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
      ':is([data-highlighted])': color.grayAlpha300,
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
      <Base.Trigger render={<Button />} {...stylex.props(style)}>
        {label}
      </Base.Trigger>
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
  /** Props for {@link Menu}. */
  type Props = {
    /** Menu items. */
    children: ReactNode
    /** Trigger content. */
    label: ReactNode
    /** Styles merged onto the trigger. */
    style?: stylex.StyleXStyles | undefined
  }

  namespace Item {
    /** Props for {@link Menu.Item}. Extends Base UI's menu item. */
    type Props = Omit<Base.Item.Props, 'className' | 'render' | 'style'> & {
      /** Item label. */
      children: ReactNode
      /** Trailing content, such as a keyboard shortcut. */
      hint?: ReactNode | undefined
    }
  }
}
