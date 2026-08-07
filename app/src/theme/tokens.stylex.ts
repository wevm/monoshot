import * as stylex from '@stylexjs/stylex'

// Geist-inspired scales, one light-dark() pair per step. Step semantics follow
// Geist: 100-300 backgrounds, 400-600 borders, 700-800 high-contrast
// backgrounds, 900-1000 text and icons. Values transcribed from Vercel's
// published palette (grays as hex, chromatic scales as oklch).
export const color = stylex.defineVars({
  background: 'light-dark(#fff, #0a0a0a)',
  backgroundSecondary: 'light-dark(#fafafa, #000)',

  // Floating surfaces let the page through: a translucent fill plus a blur
  // reads as a layer above the work rather than a hole punched in it.
  backgroundTranslucent: 'light-dark(#ffffff8f, #0a0a0a99)',

  gray100: 'light-dark(#f2f2f2, #1a1a1a)',
  gray200: 'light-dark(#ebebeb, #1f1f1f)',
  gray300: 'light-dark(#e6e6e6, #292929)',
  gray400: 'light-dark(#eaeaea, #2e2e2e)',
  gray500: 'light-dark(#c9c9c9, #454545)',
  gray600: 'light-dark(#a8a8a8, #878787)',
  gray700: 'light-dark(#8f8f8f, #8f8f8f)',
  gray800: 'light-dark(#7d7d7d, #7d7d7d)',
  gray900: 'light-dark(#4d4d4d, #a0a0a0)',
  gray1000: 'light-dark(#171717, #ededed)',

  grayAlpha100: 'light-dark(#0000000d, #ffffff12)',
  grayAlpha200: 'light-dark(#00000015, #ffffff17)',
  grayAlpha300: 'light-dark(#0000001a, #ffffff21)',
  grayAlpha400: 'light-dark(#00000014, #ffffff24)',
  grayAlpha500: 'light-dark(#00000036, #ffffff3d)',
  grayAlpha600: 'light-dark(#0000003d, #ffffff82)',
  grayAlpha700: 'light-dark(#00000070, #ffffff8a)',
  grayAlpha800: 'light-dark(#00000082, #ffffff78)',
  grayAlpha900: 'light-dark(#000000b3, #ffffff9c)',
  grayAlpha1000: 'light-dark(#000000e8, #ffffffeb)',

  blue100: 'light-dark(oklch(97.32% 0.0141 251.56), oklch(22.17% 0.069 259.89))',
  blue200: 'light-dark(oklch(96.29% 0.0195 250.59), oklch(25.45% 0.0811 255.8))',
  blue300: 'light-dark(oklch(94.58% 0.0293 249.849), oklch(30.86% 0.1022 255.21))',
  blue400: 'light-dark(oklch(91.58% 0.0473 245.116), oklch(34.1% 0.121 254.74))',
  blue500: 'light-dark(oklch(82.75% 0.0979 248.48), oklch(38.5% 0.1403 254.4))',
  blue600: 'light-dark(oklch(73.08% 0.1583 248.133), oklch(64.94% 0.1982 251.813))',
  blue700: 'light-dark(oklch(57.61% 0.2508 258.23), oklch(57.61% 0.2321 258.23))',
  blue800: 'light-dark(oklch(51.51% 0.2399 257.85), oklch(51.51% 0.2307 257.85))',
  blue900: 'light-dark(oklch(53.18% 0.2399 256.99), oklch(71.7% 0.1648 250.794))',
  blue1000: 'light-dark(oklch(26.67% 0.1099 254.34), oklch(96.75% 0.0179 242.423))',

  red100: 'light-dark(oklch(96.5% 0.0223 13.09), oklch(22.1% 0.0657 15.11))',
  red200: 'light-dark(oklch(95.41% 0.0299 14.2526), oklch(25.93% 0.0834 19.02))',
  red300: 'light-dark(oklch(94.33% 0.0369 15.0115), oklch(31.47% 0.1105 20.96))',
  red400: 'light-dark(oklch(91.51% 0.0471 19.8), oklch(35.27% 0.1273 21.23))',
  red500: 'light-dark(oklch(84.47% 0.1018 17.71), oklch(40.68% 0.1479 23.16))',
  red600: 'light-dark(oklch(71.12% 0.1881 21.22), oklch(62.56% 0.2277 23.03))',
  red700: 'light-dark(oklch(62.56% 0.2524 23.03), oklch(62.56% 0.2234 23.03))',
  red800: 'light-dark(oklch(58.19% 0.2482 25.15), oklch(58.01% 0.227 25.12))',
  red900: 'light-dark(oklch(54.99% 0.232 25.29), oklch(69.96% 0.2136 22.03))',
  red1000: 'light-dark(oklch(24.8% 0.1041 18.86), oklch(95.6% 0.0293 6.61))',

  amber100: 'light-dark(oklch(97.48% 0.0331 85.79), oklch(22.46% 0.0538 76.04))',
  amber200: 'light-dark(oklch(96.81% 0.0495 90.2423), oklch(24.95% 0.0642 64.78))',
  amber300: 'light-dark(oklch(95.93% 0.0636 90.52), oklch(32.34% 0.0837 63.83))',
  amber400: 'light-dark(oklch(91.02% 0.1322 88.25), oklch(35.53% 0.0903 66.2971))',
  amber500: 'light-dark(oklch(86.55% 0.1583 79.63), oklch(41.55% 0.1044 67.98))',
  amber600: 'light-dark(oklch(80.25% 0.1953 73.59), oklch(75.04% 0.1737 74.49))',
  amber700: 'light-dark(oklch(81.87% 0.1969 76.46), oklch(81.87% 0.1969 76.46))',
  amber800: 'light-dark(oklch(77.21% 0.1991 64.28), oklch(77.21% 0.1991 64.28))',
  amber900: 'light-dark(oklch(52.79% 0.1496 54.65), oklch(77.21% 0.1991 64.28))',
  amber1000: 'light-dark(oklch(30.83% 0.099 45.48), oklch(96.7% 0.0418 84.59))',

  green100: 'light-dark(oklch(97.59% 0.0289 145.42), oklch(23.09% 0.0716 149.68))',
  green200: 'light-dark(oklch(96.92% 0.037 147.15), oklch(27.12% 0.0895 150.09))',
  green300: 'light-dark(oklch(94.6% 0.0674 144.23), oklch(29.84% 0.096 149.25))',
  green400: 'light-dark(oklch(91.49% 0.0976 146.24), oklch(34.39% 0.1039 147.78))',
  green500: 'light-dark(oklch(85.45% 0.1627 146.3), oklch(44.19% 0.1484 147.2))',
  green600: 'light-dark(oklch(80.25% 0.214 145.18), oklch(58.11% 0.1815 146.55))',
  green700: 'light-dark(oklch(64.58% 0.1746 147.27), oklch(64.58% 0.199 147.27))',
  green800: 'light-dark(oklch(57.81% 0.1507 147.5), oklch(57.81% 0.1776 147.5))',
  green900: 'light-dark(oklch(51.75% 0.1453 147.65), oklch(73.1% 0.2158 148.29))',
  green1000: 'light-dark(oklch(29.15% 0.1197 147.38), oklch(96.76% 0.056 154.18))',

  // Text that sits on a solid colored surface, where the scheme's own
  // foreground would disappear.
  onSolid: '#fff',

  // Floating tools over the artwork read as their own dark surface in both
  // schemes, the way Apple's markup bar does, so they never invert with the app.
  chrome: '#1c1c1e',
  chromeTranslucent: '#1c1c1e99',
  onChrome: '#f5f5f7',
  onChromeSecondary: '#98989d',
  chromeHover: '#ffffff1f',
  chromeActive: '#ffffff33',
})

export const font = stylex.defineVars({
  mono: "'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
})

// Square by default: the artwork has hard edges, so the interface does too.
// The code window is the one rounded surface.
export const radius = stylex.defineVars({
  code: '12px',
  control: '0px',
  floating: '0px',
  fullscreen: '0px',
})

// Vercel's shadow-border pattern: a 1px alpha ring composed with soft shadows,
// all as box-shadow so borders never consume layout. Geometry is shared across
// schemes (colors swap via light-dark) so manual color-scheme overrides work.
export const shadow = stylex.defineVars({
  border: '0 0 0 1px light-dark(#00000014, #ffffff25)',
  borderInset: 'inset 0 0 0 1px light-dark(#00000014, #ffffff1a)',
  small: '0 0 0 1px light-dark(#00000014, #ffffff25), 0 2px 2px light-dark(#0000000a, #00000029)',
  menu: '0 0 0 1px light-dark(#00000014, #ffffff25), 0 1px 1px light-dark(#00000005, #00000038), 0 4px 8px -4px light-dark(#00000008, #0000001c), 0 16px 24px -12px light-dark(#0000000a, #0000001c)',
  // Chrome floating over the artwork earns its separation from depth alone:
  // a ring would read as a drawn edge on a surface that is meant to hover.
  // Three layers (contact, mid, ambient) and no scheme swap, since the
  // surface sits on the image rather than on the app background.
  floating:
    '0 1px 2px rgb(0 0 0 / 0.16), 0 6px 16px -8px rgb(0 0 0 / 0.24), 0 20px 40px -16px rgb(0 0 0 / 0.3)',
  tooltip:
    '0 0 0 1px light-dark(#00000014, #ffffff25), 0 1px 1px light-dark(#00000005, #00000052), 0 4px 8px light-dark(#0000000a, #00000029)',
  focusRing:
    '0 0 0 2px light-dark(#fff, #000), 0 0 0 4px light-dark(oklch(57.61% 0.2508 258.23), oklch(71.7% 0.1648 250.794))',
  thumb: '0 1px 2px light-dark(#00000029, #00000052)',
  window: '0 24px 48px -12px light-dark(#00000026, #00000059)',
})

// Inlined at build time: no CSS variables generated. The app shell republishes
// them as `--motion-*` so plain CSS can reach them, and they stay literals here
// because Motion parses the curves and durations rather than resolving them.
export const motion = stylex.defineConsts({
  /** Decelerating curve for surfaces settling into place (out-expo). */
  out: 'cubic-bezier(0.19, 1, 0.22, 1)',
  /** Symmetric curve for a value moving between two known states (in-out-quint). */
  inOut: 'cubic-bezier(0.86, 0, 0.07, 1)',
  fast: '140ms',
  medium: '260ms',
  slow: '420ms',
})
