import { currentPageSetup, type Orientation } from '../editor/page-setup'
import { showPageDialog } from '../ui/page-dialog'
import type { ViewMode } from '../ui/page-view'
import { ICONS } from './icons'
import type { Tool, ToolGroup } from './tool'

const viewTool = (mode: ViewMode, label: string, icon: string): Tool => ({
  id: mode === 'page' ? 'pageView' : 'continuousView',
  label,
  icon,
  isActive: ({ pageView }) => pageView.mode === mode,
  run: ({ pageView }) => pageView.setMode(mode),
})

const orientationTool = (orientation: Orientation, label: string, icon: string): Tool => ({
  id: orientation,
  label,
  icon,
  isActive: ({ editor }) => currentPageSetup(editor).orientation === orientation,
  run: ({ editor }) => {
    if (currentPageSetup(editor).orientation !== orientation) editor.chain().focus().setPageSetup({ orientation }).run()
  },
})

const pageBreakTool: Tool = {
  id: 'pageBreak',
  label: 'Sayfa sonu',
  icon: ICONS.pageBreak,
  keys: 'Ctrl+Enter',
  isAvailable: ({ editor }) => editor.can().setPageBreak(),
  run: ({ editor }) => { editor.chain().focus().setPageBreak().run() },
}

const pageSetupTool: Tool = {
  id: 'pageSetup',
  label: 'Sayfa Düzeni…',
  icon: ICONS.pageSetup,
  run: ({ editor }) => showPageDialog(editor),
}

const viewTools = [viewTool('page', 'Sayfa görünümü', ICONS.pageView), viewTool('continuous', 'Sürekli görünüm', ICONS.continuousView)]
const sheetTools = [orientationTool('portrait', 'Dikey', ICONS.portrait), orientationTool('landscape', 'Yatay', ICONS.landscape), pageBreakTool, pageSetupTool]

/** Sayfa ▾: the view, the paper's orientation, page breaks and the rest of the page's setup. */
export const pageGroup: ToolGroup = {
  kind: 'group',
  id: 'page',
  label: 'Sayfa',
  icon: ICONS.page,
  tools: [...viewTools, ...sheetTools],
  sections: [
    { title: 'Görünüm', tools: viewTools },
    { titleOf: ({ pageView }) => (pageView.pages === null ? 'Sayfa' : `Sayfa (${pageView.pages} sayfa)`), tools: sheetTools },
  ],
}
