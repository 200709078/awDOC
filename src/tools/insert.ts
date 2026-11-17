import { IMAGE_ACCEPT } from '../app/images'
import { insertImages } from '../editor/image'
import { showLinkDialog, showWordCount } from '../ui/dialogs'
import { showFormulaDialog } from '../ui/formula-dialog'
import { NodeSelection } from '@tiptap/pm/state'
import { ICONS } from './icons'
import type { Tool } from './tool'

export const findTool: Tool = {
  id: 'find',
  label: 'Bul',
  icon: ICONS.find,
  shortcuts: ['ctrl+f'],
  isActive: ({ searchBar }) => searchBar.isOpen,
  run: ({ searchBar }) => {
    if (searchBar.isOpen) searchBar.close()
    else searchBar.open(false)
  },
}

/** Only a shortcut: the find bar has the replace row, and Bul opens it too. */
export const replaceTool: Tool = {
  id: 'replace',
  label: 'Bul ve Değiştir',
  icon: ICONS.find,
  shortcuts: ['ctrl+h'],
  inToolbar: false,
  run: ({ searchBar }) => searchBar.open(true),
}

export const linkTool: Tool = {
  id: 'link',
  label: 'Bağlantı',
  icon: ICONS.link,
  shortcuts: ['ctrl+k'],
  isActive: ({ editor }) => editor.isActive('link'),
  run: ({ editor, platform }) => showLinkDialog(editor, platform),
}

export const wordCountTool: Tool = {
  id: 'wordCount',
  label: 'Kelime Sayısı',
  icon: ICONS.wordCount,
  shortcuts: ['ctrl+shift+g'],
  run: ({ editor }) => showWordCount(editor),
}

let imageInput: HTMLInputElement | undefined

/** The picker's own input, so a picture never goes through the document picker's types. */
export const imageTool: Tool = {
  id: 'image',
  label: 'Resim',
  icon: ICONS.image,
  run: ({ editor }) => {
    imageInput ??= Object.assign(document.createElement('input'), { type: 'file', accept: IMAGE_ACCEPT, multiple: true, hidden: true, id: 'imageInput' })
    if (!imageInput.isConnected) document.body.append(imageInput)
    imageInput.onchange = () => {
      const files = [...imageInput!.files ?? []]
      imageInput!.value = ''
      void insertImages(editor, files)
    }
    imageInput.click()
  },
}

/** Formül: a new formula, or the selected one changed. Any document may have formulas. */
export const formulaTool: Tool = {
  id: 'formula',
  label: 'Formül',
  icon: ICONS.formula,
  shortcuts: ['alt+='],
  isActive: ({ editor }) => editor.isActive('formula'),
  run: ({ editor }) => {
    const { selection } = editor.state
    const selected = selection instanceof NodeSelection && selection.node.type.name === 'formula'
    void showFormulaDialog(editor, selected ? selection.from : undefined)
  },
}
