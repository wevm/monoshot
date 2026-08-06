import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
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
      ':is([data-checked])': color.background,
    },
    borderStyle: 'none',
    borderRadius: 4,
    boxShadow: {
      default: null,
      ':is([data-checked])': shadow.small,
      ':focus-visible': shadow.focusRing,
    },
    color: {
      default: color.gray900,
      ':hover': color.gray1000,
      ':is([data-checked])': color.gray1000,
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
 *
 * Built on a radio group, which is what one-of-N selection is: roving focus,
 * arrow-key navigation, and `aria-checked` come from Base UI.
 */
export function Segmented<const value extends string | number>(props: Segmented.Props<value>) {
  const { label, onChange, options, style, value } = props
  return (
    <RadioGroup
      aria-label={label}
      onValueChange={(next) => onChange(next as value)}
      value={value}
      {...stylex.props(styles.root, style)}
    >
      {options.map((option) => (
        <Radio.Root
          key={String(option.value)}
          value={option.value}
          {...stylex.props(styles.item, text.button14)}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

export declare namespace Segmented {
  type Props<value extends string | number> = {
    /** Accessible name for the group. */
    label: string
    onChange: (value: value) => void
    options: readonly { label: string; value: value }[]
    style?: stylex.StyleXStyles | undefined
    /** Must be one of `options`. */
    value: NoInfer<value>
  }
}
