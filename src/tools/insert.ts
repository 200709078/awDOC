import { IMAGE_ACCEPT } from '../app/images'
import { insertImages, selectedImage, type ImageWrap } from '../editor/image'
import { showCropDialog } from '../ui/crop-dialog'
import { showLinkDialog, showWordCount } from '../ui/dialogs'
import { showFormulaDialog } from '../ui/formula-dialog'
import { NodeSelection } from '@tiptap/pm/state'
import { ICONS } from './icons'
import type { Tool, ToolContext, ToolGroup } from './tool'

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
const imageTool: Tool = {
  id: 'image',
  label: 'Resim ekle…',
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

let cameraInput: HTMLInputElement | undefined

/**
 * Kamera (Android): the system's camera app takes a photo and it goes into the document. The
 * WebView answers `capture` itself; with no camera permission declared it needs none (the camera
 * app takes the picture and hands it over).
 */
const cameraTool: Tool = {
  id: 'camera',
  label: 'Kameradan çek…',
  icon: ICONS.camera,
  isSupported: ({ platform }) => Boolean(platform.hasCamera),
  run: ({ editor }) => {
    cameraInput ??= Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true, id: 'cameraInput' })
    cameraInput.setAttribute('capture', 'environment')
    if (!cameraInput.isConnected) document.body.append(cameraInput)
    cameraInput.onchange = () => {
      const files = [...cameraInput!.files ?? []]
      cameraInput!.value = ''
      void insertImages(editor, files)
    }
    cameraInput.click()
  },
}

const hasImage = ({ editor }: ToolContext) => selectedImage(editor.state) !== null

const wrapTool = (wrap: ImageWrap, label: string, icon: string): Tool => ({
  id: `imageWrap-${wrap}`,
  label,
  icon,
  isAvailable: hasImage,
  isActive: ({ editor }) => selectedImage(editor.state)?.wrap === wrap,
  run: ({ editor }) => { editor.chain().focus().setImageWrap(wrap).run() },
})

const cropTool: Tool = {
  id: 'cropImage',
  label: 'Kırp…',
  icon: ICONS.crop,
  isAvailable: hasImage,
  run: ({ editor }) => showCropDialog(editor),
}

const captionTool: Tool = {
  id: 'imageCaption',
  label: 'Resim altı yazısı',
  icon: ICONS.caption,
  isAvailable: ({ editor }) => editor.can().insertImageCaption(),
  run: ({ editor }) => { editor.chain().focus().insertImageCaption().run() },
}

const wrapTools = [
  wrapTool('inline', 'Satır içinde', ICONS.wrapInline),
  wrapTool('center', 'Ortada, tek başına', ICONS.wrapCenter),
  wrapTool('left', 'Solda, yazı sağında', ICONS.wrapLeft),
  wrapTool('right', 'Sağda, yazı solunda', ICONS.wrapRight),
]
const editTools = [cropTool, captionTool]

/** Resim ▾: putting pictures in, and for the selected one (a click on it) where it stands, cropping, a caption. */
export const imageGroup: ToolGroup = {
  kind: 'group',
  id: 'image',
  label: 'Resim',
  icon: ICONS.image,
  tools: [imageTool, cameraTool, ...wrapTools, ...editTools],
  isMarked: hasImage,
  sections: [
    { tools: [imageTool, cameraTool] },
    { title: 'Yerleşim (seçili resim)', tools: wrapTools },
    { title: 'Düzenle', tools: editTools },
  ],
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
