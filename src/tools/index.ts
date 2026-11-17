import { alignGroup, listGroup, paragraphGroup, redoTool, undoTool } from './edit'
import { autoSaveTool, newDocumentTool, openTool, pdfTool, printTool, recentTool, saveAsTool, saveTool } from './file'
import { findTool, imageTool, linkTool, replaceTool, wordCountTool } from './insert'
import { tableGroup } from './table'
import { fontGroup, textGroup } from './text'
import type { ToolbarItem } from './tool'
import { aboutTool, fullscreenTool, themeTool } from './view'

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
  imageTool,
  tableGroup,
  printTool,
  pdfTool,
  saveAsTool,
  recentTool,
  fullscreenTool,
  themeTool,
  wordCountTool,
  autoSaveTool,
  aboutTool,
]
