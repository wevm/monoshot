import { Kbd } from '#/ui/Kbd.js'
import { Menu } from '#/ui/Menu.js'

/** Export actions. Capture is wired in a later change; the link is live. */
export function ExportMenu(props: ExportMenu.Props) {
  return (
    <Menu label="Export">
      <Menu.Item hint={<Kbd>⌘S</Kbd>}>Save PNG</Menu.Item>
      <Menu.Item>Save SVG</Menu.Item>
      <Menu.Item hint={<Kbd>⌘C</Kbd>}>Copy image</Menu.Item>
      <Menu.Item hint={<Kbd>⌘⇧C</Kbd>} onClick={props.onCopyUrl}>
        Copy URL
      </Menu.Item>
    </Menu>
  )
}

export declare namespace ExportMenu {
  /** Props for {@link ExportMenu}. */
  type Props = {
    /** Puts a link to the state on screen on the clipboard. */
    onCopyUrl: () => void
  }
}
