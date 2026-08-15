import { Combobox as Base } from '@base-ui/react/combobox'
import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { color, font, motion, radius, shadow } from '../theme/tokens.stylex.js'

const styles = stylex.create({
  trigger: {
    alignItems: 'center',
    backgroundColor: {
      default: color.chromeTranslucent,
      '@media (prefers-reduced-transparency: reduce)': color.chrome,
    },
    borderRadius: radius.control,
    borderStyle: 'none',
    boxShadow: { default: shadow.chromeBorder, ':focus-visible': shadow.focusRing },
    color: color.onChrome,
    cursor: 'pointer',
    display: 'flex',
    gap: 8,
    height: 32,
    justifyContent: 'space-between',
    outline: 'none',
    paddingInline: 10,
    width: '100%',
  },
  value: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  end: { alignItems: 'center', display: 'flex', flexShrink: 0, gap: 8 },
  palette: (background: string) => ({
    borderColor: background,
    borderRadius: 5,
    borderStyle: 'solid',
    borderWidth: 2,
    display: 'flex',
    gap: 2,
    padding: 2,
  }),
  chip: (paint: string) => ({
    backgroundColor: paint,
    borderRadius: 2,
    height: 12,
    width: 12,
  }),
  iconShell: { alignItems: 'center', display: 'flex', height: 16 },
  icon: { color: color.onChromeSecondary, display: 'block', height: 16, width: 16 },
  positioner: { zIndex: 10 },
  popup: {
    backdropFilter: 'blur(32px) saturate(180%)',
    backgroundColor: {
      default: color.chromeTranslucent,
      '@media (prefers-reduced-transparency: reduce)': color.chrome,
    },
    borderRadius: radius.control,
    boxShadow: shadow.menu,
    color: color.onChrome,
    fontFamily: font.mono,
    minWidth: 'var(--anchor-width)',
    opacity: { default: 1, ':is([data-starting-style], [data-ending-style])': 0 },
    outline: 'none',
    overflow: 'hidden',
    transform: {
      default: 'translateY(0) scale(1)',
      ':is([data-starting-style], [data-ending-style])': 'translateY(-4px) scale(0.98)',
    },
    transformOrigin: 'top',
    transitionDuration: motion.fast,
    transitionProperty: 'opacity, transform',
    transitionTimingFunction: motion.out,
  },
  list: {
    maxHeight: 'min(360px, var(--available-height))',
    overflowY: 'auto',
    paddingBlockEnd: 4,
    paddingBlockStart: 4,
    paddingInline: 4,
    scrollPaddingBlock: 4,
  },
  search: {
    backgroundColor: 'transparent',
    borderRadius: radius.control,
    borderStyle: 'none',
    boxShadow: shadow.chromeBorder,
    color: color.onChrome,
    height: 32,
    marginBlockStart: 4,
    marginInline: 4,
    outline: 'none',
    paddingInline: 8,
    width: 'calc(100% - 8px)',
  },
  emptyMessage: {
    color: color.onChromeSecondary,
    display: 'block',
    paddingBlock: 12,
    paddingInline: 12,
  },
  item: {
    alignItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':is([data-selected])': 'rgb(255 255 255 / 0.04)',
      ':is([data-highlighted])': color.chromeHover,
    },
    borderRadius: radius.control,
    cursor: 'pointer',
    display: 'flex',
    gap: 12,
    height: 32,
    justifyContent: 'space-between',
    outline: 'none',
    paddingInline: 8,
    userSelect: 'none',
  },
  label: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
})

/** Accessible Select whose options show representative colors beside their labels. */
export function PaletteSelect<Value extends string>(props: PaletteSelect.Props<Value>) {
  return (
    <MenuSelect
      aria-label={props['aria-label']}
      items={props.items.map((item) => ({
        end: <Palette background={item.background} colors={item.colors} />,
        label: item.label,
        value: item.value,
      }))}
      onItemHighlighted={props.onItemHighlighted}
      onValueChange={props.onValueChange}
      value={props.value}
    />
  )
}

/** Accessible popup Select with custom trailing previews. */
export function MenuSelect<Value extends string>(props: MenuSelect.Props<Value>) {
  const selected = props.items.find((item) => item.value === props.value)
  const label = (value: Value) => props.items.find((item) => item.value === value)?.label ?? value
  return (
    <Base.Root
      autoHighlight
      itemToStringLabel={label}
      items={props.items.map((item) => item.value)}
      onItemHighlighted={(value, details) => {
        if (value && (details.reason === 'keyboard' || details.reason === 'pointer'))
          props.onItemHighlighted?.(value)
      }}
      onValueChange={(value) => value && props.onValueChange(value)}
      value={props.value}
    >
      <Base.Trigger aria-label={props['aria-label']} {...stylex.props(styles.trigger, text.copy13)}>
        <span {...stylex.props(styles.value)}>
          <Base.Value>{selected?.label}</Base.Value>
        </span>
        <span {...stylex.props(styles.end)}>
          {selected?.end}
          <Base.Icon {...stylex.props(styles.iconShell)}>
            <svg aria-hidden viewBox="0 0 16 16" {...stylex.props(styles.icon)}>
              <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" />
            </svg>
          </Base.Icon>
        </span>
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner
          align="start"
          side="bottom"
          sideOffset={6}
          {...stylex.props(styles.positioner)}
        >
          <Base.Popup aria-label={`${props['aria-label']} options`} {...stylex.props(styles.popup)}>
            <Base.Input
              aria-label={`Search ${props['aria-label'].toLowerCase()}`}
              placeholder="Search…"
              {...stylex.props(styles.search, text.copy13)}
            />
            <Base.Empty>
              <span {...stylex.props(styles.emptyMessage, text.copy13)}>No results</span>
            </Base.Empty>
            <Base.List {...stylex.props(styles.list)}>
              {(value: Value) => {
                const item = props.items.find((entry) => entry.value === value)
                return item ? (
                  <Base.Item
                    key={item.value}
                    value={item.value}
                    {...stylex.props(styles.item, text.copy13)}
                  >
                    <span {...stylex.props(styles.label)}>{item.label}</span>
                    {item.end}
                  </Base.Item>
                ) : null
              }}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  )
}

function Palette(props: { background: string; colors: readonly string[] }) {
  return (
    <span aria-hidden {...stylex.props(styles.palette(props.background))}>
      {props.colors.slice(0, 3).map((paint) => (
        <span key={paint} {...stylex.props(styles.chip(paint))} />
      ))}
    </span>
  )
}

export declare namespace PaletteSelect {
  type Item<Value extends string> = {
    background: string
    colors: readonly string[]
    label: string
    value: Value
  }
  type Props<Value extends string> = {
    'aria-label': string
    items: readonly Item<Value>[]
    onItemHighlighted?: ((value: Value) => void) | undefined
    onValueChange: (value: Value) => void
    value: Value
  }
}

export declare namespace MenuSelect {
  type Item<Value extends string> = { end: ReactNode; label: string; value: Value }
  type Props<Value extends string> = {
    'aria-label': string
    items: readonly Item<Value>[]
    onItemHighlighted?: ((value: Value) => void) | undefined
    onValueChange: (value: Value) => void
    value: Value
  }
}
