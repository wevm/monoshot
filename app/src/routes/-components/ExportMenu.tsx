import { Kbd } from '#/ui/Kbd.js'
import { Menu } from '#/ui/Menu.js'

/** Export actions. Wired to real capture in a later change. */
export function ExportMenu() {
  return (
    <Menu label="Export">
      <Menu.Item hint={<Kbd>⌘S</Kbd>}>Save PNG</Menu.Item>
      <Menu.Item>Save SVG</Menu.Item>
      <Menu.Item hint={<Kbd>⌘C</Kbd>}>Copy image</Menu.Item>
      <Menu.Item hint={<Kbd>⌘⇧C</Kbd>}>Copy URL</Menu.Item>
    </Menu>
  )
}
