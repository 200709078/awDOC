import { Extension, type Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { NodeSelection, Plugin, type EditorState } from '@tiptap/pm/state'
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
 * Where a picture stands: in the line like a letter (Word's default), alone on its line in the
 * middle, or at the left / right with the text running beside it.
 */
export type ImageWrap = 'inline' | 'center' | 'left' | 'right'
export const IMAGE_WRAPS: readonly ImageWrap[] = ['inline', 'center', 'left', 'right']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentImage: {
      /** Where the selected picture stands. */
      setImageWrap: (wrap: ImageWrap) => ReturnType
      /** The selected picture becomes `src`, shown `width` px wide (after cropping). */
      replaceSelectedImage: (src: string, width: number) => ReturnType
      /** A caption paragraph ("Şekil 1: …") under the paragraph of the selected picture. */
      insertImageCaption: () => ReturnType
    }
  }
}

/** The picture selected (a click on it), with its position. */
export function selectedImage(state: EditorState): { pos: number; src: string; width: number | null; wrap: ImageWrap } | null {
  const { selection } = state
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null
  const { attrs } = selection.node
  return { pos: selection.from, src: String(attrs.src), width: Number(attrs.width) || null, wrap: (attrs.wrap as ImageWrap) ?? 'inline' }
}

/**
 * Pictures inside the text, as Word puts them by default: the paragraph's alignment places them,
 * and the corners resize them without changing their shape. Kept in the document as data, so a
 * document is one file.
 */
export const DocumentImage = Image.extend({
  // TipTap's resizing view does not take a new size from outside (cropping, undo): it is drawn anew then.
  addNodeView() {
    const parent = this.parent?.()
    if (!parent) return null
    return props => {
      const view = parent(props) as ReturnType<typeof parent> & { update?: (...args: unknown[]) => boolean }
      const update = view.update?.bind(view)
      let current = props.node
      view.update = (...args: unknown[]) => {
        const node = args[0] as typeof current
        if (node.attrs.width !== current.attrs.width || node.attrs.height !== current.attrs.height) return false
        current = node
        return update ? update(...args) : true
      }
      return view
    }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      wrap: {
        default: 'inline',
        parseHTML: element => {
          const wrap = element.getAttribute('data-wrap') as ImageWrap
          return IMAGE_WRAPS.includes(wrap) ? wrap : 'inline'
        },
        renderHTML: attributes => (attributes.wrap && attributes.wrap !== 'inline' ? { 'data-wrap': attributes.wrap } : {}),
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageWrap: wrap => ({ state, tr, dispatch }) => {
        const image = selectedImage(state)
        if (!image) return false
        if (dispatch) {
          tr.setNodeAttribute(image.pos, 'wrap', wrap)
          tr.setSelection(NodeSelection.create(tr.doc, image.pos))
        }
        return true
      },
      replaceSelectedImage: (src, width) => ({ state, tr, dispatch }) => {
        const image = selectedImage(state)
        if (!image) return false
        if (dispatch) {
          // A new node, not new attributes: the resizing view keeps its old size otherwise.
          const node = state.doc.nodeAt(image.pos)!
          tr.replaceWith(image.pos, image.pos + 1, node.type.create({ ...node.attrs, src, width: Math.round(width), height: null }))
          tr.setSelection(NodeSelection.create(tr.doc, image.pos))
        }
        return true
      },
      insertImageCaption: () => ({ state, tr, dispatch }) => {
        const image = selectedImage(state)
        if (!image) return false
        const $image = state.doc.resolve(image.pos)
        if (!$image.parent.isTextblock || $image.depth === 0) return false
        if (dispatch) {
          const after = $image.after()
          const next = state.doc.resolve(after).nodeAfter
          // There already: the cursor goes to it.
          if (next?.type.name === 'paragraph' && next.attrs.caption) tr.setSelection(NodeSelection.near(tr.doc.resolve(after + 1)))
          else {
            tr.insert(after, state.schema.nodes.paragraph.create({ caption: true, textAlign: 'center' }))
            tr.setSelection(NodeSelection.near(tr.doc.resolve(after + 1)))
          }
          tr.scrollIntoView()
        }
        return true
      },
    }
  },
}).configure({
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

/**
 * A caption: a paragraph under a picture, numbered "Şekil 1:", "Şekil 2:"… by its place in the
 * document. Enter at its end goes on with an ordinary paragraph.
 */
export const ImageCaption = Extension.create({
  name: 'imageCaption',

  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        caption: {
          default: false,
          keepOnSplit: false,
          parseHTML: element => element.hasAttribute('data-caption'),
          renderHTML: attributes => (attributes.caption ? { 'data-caption': '' } : {}),
        },
      },
    }]
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
