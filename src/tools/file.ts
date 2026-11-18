import { showRecentDocuments } from '../ui/dialogs'
import { ICONS } from './icons'
import type { Tool } from './tool'

export const newDocumentTool: Tool = {
  id: 'newDocument',
  onWelcome: true,
  label: 'Yeni',
  icon: ICONS.newDocument,
  shortcuts: ['ctrl+n'],
  run: ({ session }) => { void session.newDocument() },
}

export const openTool: Tool = {
  id: 'open',
  onWelcome: true,
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

export const pdfTool: Tool = {
  id: 'exportPdf',
  label: 'PDF Olarak Kaydet',
  icon: ICONS.pdf,
  run: ({ session }) => { void session.exportPdf() },
}

export const recentTool: Tool = {
  id: 'recent',
  onWelcome: true,
  label: 'Son Belgeler',
  icon: ICONS.recent,
  run: ({ session }) => { void showRecentDocuments(session) },
}

/** Writes awDOC files on their own after a pause in typing; on by default (the user may turn it off). */
export const autoSaveTool: Tool = {
  id: 'autoSave',
  onWelcome: true,
  label: 'Otomatik Kaydet',
  icon: ICONS.autoSave,
  isActive: ({ session }) => session.isAutoSaving,
  run: ({ session }) => session.toggleAutoSave(),
}
