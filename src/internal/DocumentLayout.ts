/** Renderer metrics shared by document CSS and fixed-canvas layout calculations. */
export const metrics = {
  annotation: { gap: 6, size: 12 },
  body: { inset: 16, padding: { plain: 8, titled: 4 } },
  code: { advance: 0.6, line: 22, size: 14, tab: 2 },
  source: { padding: 12 },
} as const
