import { useEffect } from 'react'

import * as Scheme from '#/lib/scheme.js'
import { Segmented } from './Segmented.js'

const options = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const

/** Switches the document color scheme, flipping every `light-dark()` token. */
export function SchemeToggle() {
  const scheme = Scheme.useScheme()
  useEffect(() => Scheme.hydrate(), [])
  return <Segmented label="Color scheme" onChange={Scheme.set} options={options} value={scheme} />
}
