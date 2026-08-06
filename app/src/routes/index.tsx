import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { version } from 'monoshot'

// StyleX resolves `defineVars` imports with its own resolver, which does not
// understand `#/*` package imports; `.stylex` files must be imported relatively.
import { color, font } from '../theme/tokens.stylex.js'

export const Route = createFileRoute('/')({
  component: Page,
})

const styles = stylex.create({
  main: {
    alignItems: 'center',
    backgroundColor: color.background,
    color: color.gray1000,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.sans,
    gap: 8,
    justifyContent: 'center',
    minHeight: '100dvh',
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: '-0.4px',
  },
  version: {
    color: color.gray900,
    fontFamily: font.mono,
    fontSize: 13,
  },
})

function Page() {
  return (
    <main {...stylex.props(styles.main)}>
      <h1 {...stylex.props(styles.title)}>monoshot</h1>
      <p {...stylex.props(styles.version)}>v{version}</p>
    </main>
  )
}
