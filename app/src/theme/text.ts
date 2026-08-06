import * as stylex from '@stylexjs/stylex'

// Geist type scale. Each level bundles size, line height, weight, and tracking;
// headings tighten from -2% at 20px to -6% at 72px. Kept as a `create` map (not
// vars) so a single style reference applies the whole level.
export const text = stylex.create({
  heading72: { fontSize: 72, fontWeight: 600, letterSpacing: '-4.32px', lineHeight: '72px' },
  heading64: { fontSize: 64, fontWeight: 600, letterSpacing: '-3.84px', lineHeight: '64px' },
  heading48: { fontSize: 48, fontWeight: 600, letterSpacing: '-2.88px', lineHeight: '56px' },
  heading40: { fontSize: 40, fontWeight: 600, letterSpacing: '-2.4px', lineHeight: '48px' },
  heading32: { fontSize: 32, fontWeight: 600, letterSpacing: '-1.28px', lineHeight: '40px' },
  heading24: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.96px', lineHeight: '32px' },
  heading20: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.4px', lineHeight: '26px' },
  heading16: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.32px', lineHeight: '24px' },
  heading14: { fontSize: 14, fontWeight: 600, letterSpacing: '-0.28px', lineHeight: '20px' },

  copy24: { fontSize: 24, fontWeight: 400, lineHeight: '36px' },
  copy20: { fontSize: 20, fontWeight: 400, lineHeight: '36px' },
  copy16: { fontSize: 16, fontWeight: 400, lineHeight: '24px' },
  copy14: { fontSize: 14, fontWeight: 400, lineHeight: '20px' },
  copy13: { fontSize: 13, fontWeight: 400, lineHeight: '18px' },

  label20: { fontSize: 20, fontWeight: 400, lineHeight: '32px' },
  label16: { fontSize: 16, fontWeight: 400, lineHeight: '20px' },
  label14: { fontSize: 14, fontWeight: 400, lineHeight: '20px' },
  label13: { fontSize: 13, fontWeight: 400, lineHeight: '16px' },
  label12: { fontSize: 12, fontWeight: 400, lineHeight: '16px' },

  button16: { fontSize: 16, fontWeight: 500, lineHeight: '20px' },
  button14: { fontSize: 14, fontWeight: 500, lineHeight: '20px' },
  button12: { fontSize: 12, fontWeight: 500, lineHeight: '16px' },
})
