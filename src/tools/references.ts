import { showMergeDialog } from '../ui/merge-dialog'
import { ICONS } from './icons'
import type { Tool, ToolGroup } from './tool'

/** İçindekiler: the headings with their pages, where the cursor is (one per document). */
export const contentsTool: Tool = {
  id: 'contents',
  label: 'İçindekiler',
  icon: ICONS.contents,
  isActive: ({ editor }) => editor.isActive('tableOfContents'),
  run: ({ editor }) => { editor.chain().focus().insertTableOfContents().run() },
}

/** Adres-Mektup: a copy of the document for each row of a list (students, parents…). */
export const mergeTool: Tool = {
  id: 'mailMerge',
  label: 'Adres-Mektup',
  icon: ICONS.merge,
  run: ({ editor, session }) => showMergeDialog(editor, session),
}

/** Başvurular, as in Word: what refers to other parts of the document or to outside data. */
export const referencesGroup: ToolGroup = {
  kind: 'group',
  id: 'references',
  label: 'Başvurular',
  icon: ICONS.references,
  tools: [contentsTool, mergeTool],
}
