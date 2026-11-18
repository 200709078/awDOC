import { alignGroup, listGroup, paragraphGroup, redoTool, undoTool } from './edit'
import { autoSaveTool, docxTool, newDocumentTool, odtTool, openTool, pdfTool, printTool, recentTool, saveAsTool, saveTool } from './file'
import { examGroup } from './exam'
import { findTool, formulaTool, imageGroup, linkTool, replaceTool, wordCountTool } from './insert'
import { pageGroup } from './page'
import { tableGroup } from './table'
import { fontGroup, textGroup } from './text'
import type { ToolbarItem } from './tool'
import { aboutTool, fullscreenTool, themeTool, welcomeTool } from './view'

/**
 * The toolbar, in order. When the row is full its last items move into the ☰ menu, so the ones
 * used least come last; Hakkında always closes the menu.
 */
export const TOOLBAR: readonly ToolbarItem[] = [
  newDocumentTool,
  openTool,
  saveTool,
  undoTool,
  redoTool,
  textGroup,
  fontGroup,
  paragraphGroup,
  listGroup,
  alignGroup,
  findTool,
  replaceTool,
  linkTool,
  imageGroup,
  formulaTool,
  examGroup,
  tableGroup,
  pageGroup,
  printTool,
  pdfTool,
  saveAsTool,
  docxTool,
  odtTool,
  recentTool,
  fullscreenTool,
  themeTool,
  wordCountTool,
  autoSaveTool,
  welcomeTool,
  aboutTool,
]
