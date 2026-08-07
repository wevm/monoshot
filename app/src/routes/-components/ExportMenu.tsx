import { scales } from '#/lib/export.js'
import type { capture } from '#/lib/export.js'
import { Kbd } from '#/ui/Kbd.js'
import { Menu } from '#/ui/Menu.js'

/** Export actions. Capture is wired in a later change; the link is live. */
export function ExportMenu(props: ExportMenu.Props) {
  return (
    <Menu label="Export">
      {scales.map((scale) => (
        <Menu.Item
          hint={scale === 2 ? <Kbd>⌘S</Kbd> : undefined}
          key={scale}
          onClick={() => props.onSave({ scale, type: 'png' })}
        >
          Save PNG {scale}x
        </Menu.Item>
      ))}
      <Menu.Item onClick={() => props.onSave({ scale: 1, type: 'svg' })}>Save SVG</Menu.Item>
      <Menu.Item hint={<Kbd>⌘C</Kbd>} onClick={props.onCopyImage}>
        Copy image
      </Menu.Item>
      <Menu.Item hint={<Kbd>⌘⇧C</Kbd>} onClick={props.onCopyUrl}>
        Copy URL
      </Menu.Item>
    </Menu>
  )
}

export declare namespace ExportMenu {
  /** Props for {@link ExportMenu}. */
  type Props = {
    /** Puts the artwork on the clipboard as a PNG. */
    onCopyImage: () => void
    /** Puts a link to the state on screen on the clipboard. */
    onCopyUrl: () => void
    /** Saves the artwork to the user's downloads. */
    onSave: (options: capture.Options) => void
  }
}
