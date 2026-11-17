import type { Editor } from '@tiptap/core'
import type { DocumentSession } from '../app/session'
import type { Platform } from '../platform/platform'
import type { Theme } from '../ui/theme'

/** What a tool may use. Tools reach the document and the platform only through this. */
export interface ToolContext {
  readonly editor: Editor
  readonly session: DocumentSession
  readonly platform: Platform
  readonly theme: Theme
}

/**
 * One feature of the app. A new tool lives in its own file here and is added to `tools/index.ts`;
 * the toolbar and the shortcuts are built from that list, so the core stays untouched.
 */
export interface Tool {
  /** Unique; the button's element ID is `tool-<id>`. */
  readonly id: string
  readonly label: string
  /** The inside of a 24×24 stroked SVG. */
  readonly icon: string
  /** Such as `ctrl+o`, handled by the app; see `ui/toolbar.ts` `shortcutOf`. */
  readonly shortcuts?: readonly string[]
  /** A key the editor itself handles (Ctrl+B), shown in the button's hint only. */
  readonly keys?: string
  /**
   * In a group's window: shown as the icon alone, for icons everyone knows (B, I, U, the
   * alignment lines). The others keep their names there, since a touch screen shows no hints.
   */
  readonly iconOnly?: boolean
  /** Disabled while this is false; read whenever the document or the selection changes. */
  isAvailable?(context: ToolContext): boolean
  /** Makes the button an on/off switch; it shows as pressed while this is true. */
  isActive?(context: ToolContext): boolean
  /** A dot on the button while this is true, such as unsaved changes on Kaydet. */
  isMarked?(context: ToolContext): boolean
  /** Left out altogether where the platform cannot do it. */
  isSupported?(context: ToolContext): boolean
  /** Always in the ☰ menu, at its end (Hakkında); the menu button then shows on wide screens too. */
  readonly inMenu?: boolean
  run(context: ToolContext): void
}

/**
 * One button with ▾ that opens a small window of tools (the family's toolbar style, 2026-11-10).
 * In the ☰ menu it opens in place, like an accordion.
 */
export interface ToolGroup {
  readonly kind: 'group'
  /** Unique; the button's element ID is `group-<id>`. */
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly tools: readonly Tool[]
  /** The group's button shows the state inside, such as the current alignment's icon. */
  iconOf?(context: ToolContext): string
  /** Choices are made one after another here (bold, then italic), so a choice does not close it. */
  readonly staysOpen?: boolean
  /** The tools inside are switches; the group's button carries a mark while one is on. */
  readonly marksActive?: boolean
}

export type ToolbarItem = Tool | ToolGroup

export const isGroup = (item: ToolbarItem): item is ToolGroup => 'kind' in item && item.kind === 'group'
