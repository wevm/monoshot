import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { Button } from '#/ui/Button.js'
import { Input } from '#/ui/Input.js'
import { Kbd } from '#/ui/Kbd.js'
import { Menu } from '#/ui/Menu.js'
import { SchemeToggle } from '#/ui/SchemeToggle.js'
import { Segmented } from '#/ui/Segmented.js'
import { Select } from '#/ui/Select.js'
import { Switch } from '#/ui/Switch.js'
import { Tooltip } from '#/ui/Tooltip.js'
import { color, font, radius, shadow } from '../theme/tokens.stylex.js'

export const Route = createFileRoute('/design')({
  component: Page,
})

const styles = stylex.create({
  page: {
    backgroundColor: color.background,
    color: color.gray1000,
    fontFamily: font.sans,
    minHeight: '100dvh',
    paddingBlock: 40,
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
    marginInline: 'auto',
    maxWidth: 880,
    paddingInline: 24,
  },
  header: { alignItems: 'baseline', display: 'flex', gap: 16, justifyContent: 'space-between' },
  section: { display: 'flex', flexDirection: 'column', gap: 16 },
  sectionTitle: { color: color.gray900 },
  row: { alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 12 },
  stack: { display: 'flex', flexDirection: 'column', gap: 8 },
  swatchGrid: {
    display: 'grid',
    gap: 4,
    gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
  },
  swatch: { borderRadius: 4, boxShadow: shadow.borderInset, height: 40 },
  swatchLabel: { color: color.gray700 },
  card: {
    backgroundColor: color.background,
    borderRadius: radius.floating,
    boxShadow: shadow.border,
    padding: 20,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 280 },
  fieldLabel: { color: color.gray900 },
  mono: { fontFamily: font.mono },
})

const grays = stylex.create({
  s100: { backgroundColor: color.gray100 },
  s200: { backgroundColor: color.gray200 },
  s300: { backgroundColor: color.gray300 },
  s400: { backgroundColor: color.gray400 },
  s500: { backgroundColor: color.gray500 },
  s600: { backgroundColor: color.gray600 },
  s700: { backgroundColor: color.gray700 },
  s800: { backgroundColor: color.gray800 },
  s900: { backgroundColor: color.gray900 },
  s1000: { backgroundColor: color.gray1000 },
})

const blues = stylex.create({
  s100: { backgroundColor: color.blue100 },
  s200: { backgroundColor: color.blue200 },
  s300: { backgroundColor: color.blue300 },
  s400: { backgroundColor: color.blue400 },
  s500: { backgroundColor: color.blue500 },
  s600: { backgroundColor: color.blue600 },
  s700: { backgroundColor: color.blue700 },
  s800: { backgroundColor: color.blue800 },
  s900: { backgroundColor: color.blue900 },
  s1000: { backgroundColor: color.blue1000 },
})

const reds = stylex.create({
  s100: { backgroundColor: color.red100 },
  s200: { backgroundColor: color.red200 },
  s300: { backgroundColor: color.red300 },
  s400: { backgroundColor: color.red400 },
  s500: { backgroundColor: color.red500 },
  s600: { backgroundColor: color.red600 },
  s700: { backgroundColor: color.red700 },
  s800: { backgroundColor: color.red800 },
  s900: { backgroundColor: color.red900 },
  s1000: { backgroundColor: color.red1000 },
})

const ambers = stylex.create({
  s100: { backgroundColor: color.amber100 },
  s200: { backgroundColor: color.amber200 },
  s300: { backgroundColor: color.amber300 },
  s400: { backgroundColor: color.amber400 },
  s500: { backgroundColor: color.amber500 },
  s600: { backgroundColor: color.amber600 },
  s700: { backgroundColor: color.amber700 },
  s800: { backgroundColor: color.amber800 },
  s900: { backgroundColor: color.amber900 },
  s1000: { backgroundColor: color.amber1000 },
})

const greens = stylex.create({
  s100: { backgroundColor: color.green100 },
  s200: { backgroundColor: color.green200 },
  s300: { backgroundColor: color.green300 },
  s400: { backgroundColor: color.green400 },
  s500: { backgroundColor: color.green500 },
  s600: { backgroundColor: color.green600 },
  s700: { backgroundColor: color.green700 },
  s800: { backgroundColor: color.green800 },
  s900: { backgroundColor: color.green900 },
  s1000: { backgroundColor: color.green1000 },
})

const scales = [
  { name: 'gray', steps: grays },
  { name: 'blue', steps: blues },
  { name: 'red', steps: reds },
  { name: 'amber', steps: ambers },
  { name: 'green', steps: greens },
] as const

const stepKeys = [
  's100',
  's200',
  's300',
  's400',
  's500',
  's600',
  's700',
  's800',
  's900',
  's1000',
] as const

const typeLevels = [
  { name: 'heading-32', style: text.heading32 },
  { name: 'heading-24', style: text.heading24 },
  { name: 'heading-20', style: text.heading20 },
  { name: 'heading-16', style: text.heading16 },
  { name: 'copy-16', style: text.copy16 },
  { name: 'copy-14', style: text.copy14 },
  { name: 'copy-13', style: text.copy13 },
  { name: 'label-13', style: text.label13 },
  { name: 'button-14', style: text.button14 },
] as const

const paddingOptions = [
  { label: '16', value: 16 },
  { label: '32', value: 32 },
  { label: '64', value: 64 },
  { label: '128', value: 128 },
] as const

function Section(props: { children: ReactNode; title: string }) {
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.sectionTitle, text.label13)}>{props.title}</h2>
      {props.children}
    </section>
  )
}

function Page() {
  const [padding, setPadding] = useState<(typeof paddingOptions)[number]['value']>(64)
  const [checked, setChecked] = useState(true)
  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.container)}>
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(text.heading32)}>Design system</h1>
          <SchemeToggle />
        </header>

        <Section title="Color">
          {scales.map((scale) => (
            <div key={scale.name} {...stylex.props(styles.stack)}>
              <span {...stylex.props(styles.swatchLabel, text.label12, styles.mono)}>
                {scale.name}
              </span>
              <div {...stylex.props(styles.swatchGrid)}>
                {stepKeys.map((step) => (
                  <div key={step} {...stylex.props(styles.swatch, scale.steps[step])} />
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Typography">
          <div {...stylex.props(styles.stack)}>
            {typeLevels.map((level) => (
              <div key={level.name} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.swatchLabel, text.label12, styles.mono)}>
                  {level.name}
                </span>
                <span {...stylex.props(level.style)}>The quick brown fox</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons">
          <div {...stylex.props(styles.row)}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="tertiary">Tertiary</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div {...stylex.props(styles.row)}>
            <Button size="small">Small</Button>
            <Button size="medium">Medium</Button>
            <Button size="large">Large</Button>
            <Button aria-label="Copy image" size="medium" square>
              ⌘
            </Button>
          </div>
        </Section>

        <Section title="Controls">
          <div {...stylex.props(styles.row)}>
            <Segmented
              label="Padding"
              onChange={setPadding}
              options={paddingOptions}
              value={padding}
            />
            <Switch aria-label="Show background" checked={checked} onCheckedChange={setChecked} />
            <Tooltip label="Copy image">
              <Button size="small" variant="tertiary">
                Hover me
              </Button>
            </Tooltip>
            <Kbd>⌘</Kbd>
            <Kbd>S</Kbd>
          </div>
          <div {...stylex.props(styles.row)}>
            <div {...stylex.props(styles.field)}>
              <label htmlFor="title" {...stylex.props(styles.fieldLabel, text.label13)}>
                Title
              </label>
              <Input id="title" placeholder="untitled" />
            </div>
            <div {...stylex.props(styles.field)}>
              <label htmlFor="theme" {...stylex.props(styles.fieldLabel, text.label13)}>
                Theme
              </label>
              <Select defaultValue="vitesse-dark" id="theme">
                <option value="vitesse-dark">Vitesse Dark</option>
                <option value="github-light">GitHub Light</option>
              </Select>
            </div>
            <Menu label="Export">
              <Menu.Item hint={<Kbd>S</Kbd>}>Save PNG</Menu.Item>
              <Menu.Item>Save SVG</Menu.Item>
              <Menu.Item hint={<Kbd>C</Kbd>}>Copy image</Menu.Item>
            </Menu>
          </div>
        </Section>

        <Section title="Surfaces">
          <div {...stylex.props(styles.card)}>
            <p {...stylex.props(text.copy14)}>
              A card on the page background, separated by the shadow-border ring rather than a
              layout-consuming border.
            </p>
          </div>
        </Section>
      </div>
    </main>
  )
}
