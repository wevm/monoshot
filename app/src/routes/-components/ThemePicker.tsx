import { Theme } from 'monoshot'

import { Select } from '#/ui/Select.js'

const groups = [
  { label: 'Dark', themes: Theme.list().filter((entry) => entry.type === 'dark') },
  { label: 'Light', themes: Theme.list().filter((entry) => entry.type === 'light') },
]

/** Picks among every theme shiki bundles. Metadata only: payloads load on selection. */
export function ThemePicker(props: ThemePicker.Props) {
  const { onChange, value } = props
  return (
    <Select
      aria-label="Theme"
      onChange={(event) => onChange(event.target.value as Theme.Info['name'])}
      size="small"
      value={value}
    >
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.themes.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.displayName}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

export declare namespace ThemePicker {
  type Props = {
    onChange: (theme: Theme.Info['name']) => void
    /** Must be a theme shiki bundles. */
    value: Theme.Info['name']
  }
}
