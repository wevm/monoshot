import * as stylex from '@stylexjs/stylex'

// Starter tokens proving the StyleX + light-dark() pipeline; the full
// Geist-inspired scales land with the design system.
export const color = stylex.defineVars({
  background: 'light-dark(#fff, #0a0a0a)',
  foreground: 'light-dark(#171717, #ededed)',
  foregroundSecondary: 'light-dark(#4d4d4d, #a0a0a0)',
})

export const font = stylex.defineVars({
  mono: "'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
  sans: "'Geist Variable', system-ui, -apple-system, sans-serif",
})
