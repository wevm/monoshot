import { Menu as Base } from '@base-ui/react/menu'
import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { Button } from './Button.js'
import { color, font, motion, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  popup: {
    backdropFilter: 'blur(32px) saturate(180%)',
    // The portal lands under `body`, outside the element that sets the font.
    fontFamily: font.mono,
    backgroundColor: {
      default: color.backgroundTranslucent,
      '@media (prefers-reduced-transparency: reduce)': color.background,
    },
    // Base UI stamps these while the popup enters and leaves.
    opacity: { default: 1, ':is([data-starting-style], [data-ending-style])': 0 },
    transform: {
      default: 'translateY(0) scale(1)',
      ':is([data-starting-style], [data-ending-style])': 'translateY(-4px) scale(0.98)',
    },
    transformOrigin: 'top right',
    transitionDuration: motion.fast,
    transitionProperty: 'opacity, transform',
    transitionTimingFunction: motion.out,
    borderRadius: radius.floating,
    boxShadow: shadow.menu,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 200,
    outline: 'none',
    padding: 4,
  },
  // Clears the page's own layers: the menu portals out of `main`, so it has to
  // outrank the crop guides and the toolbar rather than trail them. Floating UI
  // puts a transform on the positioner, making it the stacking context, so the
  // z-index belongs here and not on the popup inside it.
  positioner: { zIndex: 10 },
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
    // An item runs an action, so it acknowledges the press that starts it.
    transform: { default: 'scale(1)', ':active': 'scale(0.97)' },
    transitionDuration: motion.fast,
    transitionProperty: 'transform',
    transitionTimingFunction: motion.out,
    userSelect: 'none',
  },
})

/** Dropdown menu. Focus management, typeahead, and dismissal come from Base UI. */
export function Menu(props: Menu.Props) {
  const { children, label, style } = props
  return (
    <Base.Root>
      {/* Through Button's own `style`: a forwarded `className` would be
          replaced by the class Button generates for itself. */}
      <Base.Trigger render={<Button style={style} variant="tertiary" />}>{label}</Base.Trigger>
      <Base.Portal>
        <Base.Positioner
          align="end"
          side="bottom"
          sideOffset={6}
          {...stylex.props(styles.positioner)}
        >
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
