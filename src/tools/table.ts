import type { ChainedCommands } from '@tiptap/core'
import { showTableDialog } from '../ui/dialogs'
import { ICONS } from './icons'
import type { Tool, ToolContext, ToolGroup } from './tool'

type TableCommand = 'addRowBefore' | 'addRowAfter' | 'deleteRow' | 'addColumnBefore' | 'addColumnAfter' | 'deleteColumn'
  | 'mergeCells' | 'splitCell' | 'toggleHeaderRow' | 'deleteTable'

/** A table command; disabled where it cannot work (outside a table, one cell to merge). */
const tableTool = (id: TableCommand, label: string, icon: string, extra: Partial<Tool> = {}): Tool => ({
  id,
  label,
  icon,
  isAvailable: ({ editor }) => (editor.can() as unknown as Record<TableCommand, () => boolean>)[id](),
  run: ({ editor }) => { (editor.chain().focus() as unknown as Record<TableCommand, () => ChainedCommands>)[id]().run() },
  ...extra,
})

const insertTableTool: Tool = {
  id: 'insertTable',
  label: 'Tablo Ekle…',
  icon: ICONS.table,
  isAvailable: ({ editor }) => !editor.isActive('table'),
  run: ({ editor }) => showTableDialog(editor),
}

const rowTools = [
  tableTool('addRowBefore', 'Üste satır ekle', ICONS.rowAbove),
  tableTool('addRowAfter', 'Alta satır ekle', ICONS.rowBelow),
  tableTool('deleteRow', 'Satırı sil', ICONS.deleteRow),
]

const columnTools = [
  tableTool('addColumnBefore', 'Sola sütun ekle', ICONS.columnLeft),
  tableTool('addColumnAfter', 'Sağa sütun ekle', ICONS.columnRight),
  tableTool('deleteColumn', 'Sütunu sil', ICONS.deleteColumn),
]

const cellTools = [
  tableTool('mergeCells', 'Hücreleri birleştir', ICONS.mergeCells),
  tableTool('splitCell', 'Hücreyi böl', ICONS.splitCell),
  tableTool('toggleHeaderRow', 'Başlık satırı', ICONS.headerRow, {
    isActive: ({ editor }: ToolContext) => editor.isActive('tableHeader'),
  }),
]

const deleteTableTool = tableTool('deleteTable', 'Tabloyu sil', ICONS.deleteTable)

export const tableGroup: ToolGroup = {
  kind: 'group',
  id: 'table',
  label: 'Tablo',
  icon: ICONS.table,
  tools: [insertTableTool, ...rowTools, ...columnTools, ...cellTools, deleteTableTool],
  sections: [
    { tools: [insertTableTool] },
    { title: 'Satır', tools: rowTools },
    { title: 'Sütun', tools: columnTools },
    { title: 'Hücre', tools: cellTools },
    { tools: [deleteTableTool] },
  ],
  isMarked: ({ editor }) => editor.isActive('table'),
}
