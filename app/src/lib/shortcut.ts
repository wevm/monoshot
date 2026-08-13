/** Returns an unmodified character shortcut only within its active surface. */
export function scoped(
  event: { altKey: boolean; ctrlKey: boolean; key: string; metaKey: boolean },
  options: { active: boolean; editable: boolean },
): string | undefined {
  if (!options.active || options.editable || event.altKey || event.ctrlKey || event.metaKey)
    return undefined
  return event.key.length === 1 ? event.key.toLowerCase() : undefined
}
