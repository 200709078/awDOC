import { isTracking } from '../editor/review'
import { askAuthor, showCommentDialog } from '../ui/comments-panel'
import { ICONS } from './icons'
import type { Tool, ToolGroup } from './tool'

export const commentTool: Tool = {
  id: 'addComment',
  label: 'Yorum Ekle',
  icon: ICONS.comment,
  isAvailable: ({ editor }) => !editor.state.selection.empty,
  run: ({ editor, comments }) => showCommentDialog(editor, comments),
}

export const commentsTool: Tool = {
  id: 'comments',
  label: 'Yorumlar',
  icon: ICONS.comment,
  isActive: ({ comments }) => comments.isOpen,
  run: ({ comments }) => comments.setOpen(!comments.isOpen),
}

export const trackTool: Tool = {
  id: 'trackChanges',
  label: 'Değişiklikleri İzle',
  icon: ICONS.track,
  isActive: ({ editor }) => isTracking(editor.state.doc),
  run: async ({ editor }) => {
    if (isTracking(editor.state.doc)) {
      editor.chain().focus().setTrackChanges(false).run()
      return
    }
    if (await askAuthor()) editor.chain().focus().setTrackChanges(true).run()
    else editor.commands.focus()
  },
}

const settleTool = (id: string, label: string, icon: string, accept: boolean, all: boolean): Tool => ({
  id,
  label,
  icon,
  isAvailable: ({ editor }) => (accept ? editor.can().acceptChanges(all) : editor.can().rejectChanges(all)),
  run: ({ editor }) => { editor.chain().focus()[accept ? 'acceptChanges' : 'rejectChanges'](all).run() },
})

export const acceptTool = settleTool('acceptChange', 'Kabul Et', ICONS.accept, true, false)
export const rejectTool = settleTool('rejectChange', 'Reddet', ICONS.reject, false, false)
export const acceptAllTool = settleTool('acceptAll', 'Tümünü Kabul Et', ICONS.accept, true, true)
export const rejectAllTool = settleTool('rejectAll', 'Tümünü Reddet', ICONS.reject, false, true)

/** Gözden Geçir, as in Word: comments and tracked changes. */
export const reviewGroup: ToolGroup = {
  kind: 'group',
  id: 'review',
  label: 'Gözden Geçir',
  icon: ICONS.review,
  tools: [commentTool, commentsTool, trackTool, acceptTool, rejectTool, acceptAllTool, rejectAllTool],
  isMarked: ({ editor }) => isTracking(editor.state.doc),
  sections: [
    { title: 'Yorumlar', tools: [commentTool, commentsTool] },
    { title: 'Değişiklikler', tools: [trackTool, acceptTool, rejectTool, acceptAllTool, rejectAllTool] },
  ],
}
