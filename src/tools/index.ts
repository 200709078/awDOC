import { alignGroup, listGroup, paragraphGroup, redoTool, undoTool } from './edit'
import { newDocumentTool, openTool, printTool, saveAsTool, saveTool } from './file'
import { findTool, linkTool, replaceTool, wordCountTool } from './insert'
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
  tableGroup,
  printTool,
  saveAsTool,
  fullscreenTool,
  themeTool,
  wordCountTool,
  aboutTool,
]
