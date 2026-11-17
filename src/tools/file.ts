import { ICONS } from './icons'
import type { Tool } from './tool'

export const newDocumentTool: Tool = {
  id: 'newDocument',
  label: 'Yeni',
  icon: ICONS.newDocument,
  shortcuts: ['ctrl+n'],
  run: ({ session }) => { void session.newDocument() },
}

export const openTool: Tool = {
  id: 'open',
  label: 'Aç',
  icon: ICONS.open,
  shortcuts: ['ctrl+o'],
  run: ({ session }) => session.pickFile(),
}

export const saveTool: Tool = {
  id: 'save',
  label: 'Kaydet',
  icon: ICONS.save,
  shortcuts: ['ctrl+s'],
  // Phones have no room for the document's name; the dot still says there is something to save.
  isMarked: ({ session }) => session.isDirty,
  run: ({ session }) => { void session.save() },
}

export const saveAsTool: Tool = {
  id: 'saveAs',
  label: 'Farklı Kaydet',
  icon: ICONS.saveAs,
  shortcuts: ['ctrl+shift+s'],
  run: ({ session }) => { void session.saveAs() },
}

export const printTool: Tool = {
  id: 'print',
  label: 'Yazdır',
  icon: ICONS.print,
  shortcuts: ['ctrl+p'],
  run: ({ platform }) => platform.print(),
}
