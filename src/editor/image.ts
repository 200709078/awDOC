import { Extension, type Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin } from '@tiptap/pm/state'
import { isImage, prepareImage } from '../app/images'
import { showToast } from '../ui/messages'

/** Puts pictures in at `position`, or where the cursor is; a file that is not a picture is skipped. */
export async function insertImages(editor: Editor, files: readonly Blob[], position?: number): Promise<number> {
  let inserted = 0
  for (const file of files.filter(isImage)) {
    let image
    try {
      image = await prepareImage(file)
    } catch (error) {
      console.error(error)
      showToast('Resim okunamadı: dosya bozuk ya da desteklenmeyen bir biçimde.')
      continue
    }
    const content = { type: 'image', attrs: { src: image.src, width: image.width } }
    const chain = editor.chain().focus()
    if (position !== undefined && inserted === 0) chain.insertContentAt(position, content)
    else chain.insertContent(content)
    chain.run()
    inserted++
  }
  return inserted
}

/**
 * Pictures inside the text, as Word puts them by default: the paragraph's alignment places them,
 * and the corners resize them without changing their shape. Kept in the document as data, so a
 * document is one file.
 */
export const DocumentImage = Image.configure({
  inline: true,
  allowBase64: true,
  resize: {
    enabled: true,
    directions: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    minWidth: 24,
    minHeight: 24,
    alwaysPreserveAspectRatio: true,
  },
})

/** A picture pasted (a screenshot) or dropped on the page goes in; other files go on to the app. */
export const ImageInput = Extension.create({
  name: 'imageInput',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [new Plugin({
      props: {
        handlePaste: (_view, event) => {
          const files = [...event.clipboardData?.files ?? []].filter(isImage)
          if (files.length === 0) return false
          void insertImages(editor, files)
          return true
        },
        handleDrop: (view, event) => {
          const files = [...event.dataTransfer?.files ?? []]
          if (files.length === 0 || !files.every(isImage)) return false
          event.preventDefault()
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          void insertImages(editor, files, position)
          return true
        },
      },
    })]
  },
})
