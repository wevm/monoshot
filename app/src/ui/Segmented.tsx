import { ToggleGroup } from '@base-ui/react/toggle-group'
import { Toggle } from '@base-ui/react/toggle'
import * as stylex from '@stylexjs/stylex'

import { text } from '#/theme/text.js'
import { color, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  root: {
    backgroundColor: color.grayAlpha100,
    borderRadius: radius.control,
    display: 'inline-flex',
    gap: 2,
    padding: 2,
  },
  item: {
    alignItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':is([data-pressed])': color.background,
    },
    borderStyle: 'none',
    borderRadius: 4,
    boxShadow: {
      default: null,
      ':is([data-pressed])': shadow.small,
      ':focus-visible': shadow.focusRing,
    },
    color: {
      default: color.gray900,
      ':hover': color.gray1000,
      ':is([data-pressed])': color.gray1000,
    },
    cursor: 'pointer',
    display: 'flex',
    height: 28,
    justifyContent: 'center',
    outline: 'none',
    paddingInline: 10,
    userSelect: 'none',
  },
})

/**
 * Segmented control: a recessed track whose active option reads as a raised chip.
 * Roving focus and arrow-key navigation come from Base UI's toggle group.
 */
export function Segmented<const value extends string>(props: Segmented.Props<value>) {
  const { label, onChange, options, style, value } = props
  return (
    <ToggleGroup
      aria-label={label}
      // Base UI models the group value as an array; this control is single-select,
      // and an empty next value means the active item was pressed again.
      onValueChange={(next: unknown[]) => onChange((next[0] as value) ?? value)}
      value={[value]}
      {...stylex.props(styles.root, style)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          {...stylex.props(styles.item, text.button14)}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

export declare namespace Segmented {
  type Props<value extends string> = {
    label: string
    onChange: (value: value) => void
    options: readonly { label: string; value: value }[]
    style?: stylex.StyleXStyles | undefined
    value: value
  }
}
