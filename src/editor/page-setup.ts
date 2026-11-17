import { Extension, Node, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

export type Orientation = 'portrait' | 'landscape'
export type PageNumberPlace = 'none' | 'bottom-center' | 'bottom-right' | 'top-right'
export type PageNumberFormat = 'number' | 'number-of-total' | 'page-number'

/** Millimetres, as on a ruler. */
export interface Margins {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/**
 * The page the document is written for. It lives in the document itself (the `page` attribute of
 * the top node), so it is saved with the file, undone with Ctrl+Z and kept in the recovery copy.
 */
export interface PageSetup {
  readonly orientation: Orientation
  readonly margins: Margins
  /** One line at the top / bottom of every page; empty for none. */
  readonly header: string
  readonly footer: string
  readonly pageNumbers: PageNumberPlace
  readonly numberFormat: PageNumberFormat
}

/** A4, in millimetres. */
export const A4 = { width: 210, height: 297 } as const

/** Word's "Normal" margins. */
export const MARGIN_PRESETS: readonly { readonly id: string; readonly label: string; readonly margins: Margins }[] = [
  { id: 'normal', label: 'Normal (2,5 cm)', margins: { top: 25, right: 25, bottom: 25, left: 25 } },
  { id: 'narrow', label: 'Dar (1,27 cm)', margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  { id: 'wide', label: 'Geniş (2,5 cm / 5 cm)', margins: { top: 25, right: 50, bottom: 25, left: 50 } },
]

export const DEFAULT_PAGE_SETUP: PageSetup = {
  orientation: 'portrait',
  margins: MARGIN_PRESETS[0].margins,
  header: '',
  footer: '',
  pageNumbers: 'none',
  numberFormat: 'number',
}

/** Margins smaller than this or leaving a text column narrower than this are refused. */
export const MIN_MARGIN = 5
export const MAX_MARGIN = 80
const MIN_TEXT = 50
const MAX_LINE = 200

const PLACES: readonly PageNumberPlace[] = ['none', 'bottom-center', 'bottom-right', 'top-right']
const FORMATS: readonly PageNumberFormat[] = ['number', 'number-of-total', 'page-number']

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? value as T : fallback
}

function margin(value: unknown, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.round(Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, number)) * 10) / 10
}

function line(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : ''
}

/** Width and height of the sheet in millimetres, turned for landscape. */
export function pageSize(setup: PageSetup): { width: number; height: number } {
  return setup.orientation === 'landscape' ? { width: A4.height, height: A4.width } : { ...A4 }
}

/**
 * A full, sensible setup from whatever a file holds: unknown values fall back to the defaults and
 * margins that would leave no room for text shrink back to the default.
 */
export function normalizePageSetup(value: unknown): PageSetup {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const rawMargins = (raw.margins && typeof raw.margins === 'object' ? raw.margins : {}) as Record<string, unknown>
  const fallback = DEFAULT_PAGE_SETUP.margins
  const setup: PageSetup = {
    orientation: oneOf(raw.orientation, ['portrait', 'landscape'] as const, 'portrait'),
    margins: {
      top: margin(rawMargins.top, fallback.top),
      right: margin(rawMargins.right, fallback.right),
      bottom: margin(rawMargins.bottom, fallback.bottom),
      left: margin(rawMargins.left, fallback.left),
    },
    header: line(raw.header),
    footer: line(raw.footer),
    pageNumbers: oneOf(raw.pageNumbers, PLACES, 'none'),
    numberFormat: oneOf(raw.numberFormat, FORMATS, 'number'),
  }
  const size = pageSize(setup)
  const { top, right, bottom, left } = setup.margins
  if (size.width - left - right < MIN_TEXT || size.height - top - bottom < MIN_TEXT) return { ...setup, margins: fallback }
  return setup
}

export function pageSetupOf(doc: ProseMirrorNode): PageSetup {
  return normalizePageSetup(doc.attrs.page)
}

/** "3", "3 / 7" or "Sayfa 3", as chosen. */
export function pageNumberText(setup: PageSetup, page: number, pages: number): string {
  if (setup.numberFormat === 'number-of-total') return `${page} / ${pages}`
  if (setup.numberFormat === 'page-number') return `Sayfa ${page}`
  return String(page)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageSetup: {
      /** Changes the page; one step of undo. */
      setPageSetup: (changes: Partial<PageSetup>) => ReturnType
    }
    pageBreak: {
      /** Ctrl+Enter: what follows starts on a new page. */
      setPageBreak: () => ReturnType
    }
  }
}

/** The `page` attribute on the document node and the command that changes it. */
export const PageSetupExtension = Extension.create({
  name: 'pageSetup',

  addGlobalAttributes() {
    return [{ types: ['doc'], attributes: { page: { default: null, rendered: false } } }]
  },

  addCommands() {
    return {
      setPageSetup: changes => ({ tr, state, dispatch }) => {
        const next = normalizePageSetup({ ...pageSetupOf(state.doc), ...changes })
        if (dispatch) tr.setDocAttribute('page', next)
        return true
      },
    }
  },
})

/**
 * A page break: a block of its own between paragraphs, so it can be selected and deleted like
 * one. Only between the document's own paragraphs, not inside a list or a table.
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML() {
    return ['div', { 'data-page-break': '', class: 'page-break', contenteditable: 'false', title: 'Sayfa sonu' }]
  },

  addCommands() {
    return {
      setPageBreak: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection
        if ($from.depth !== 1 || !$from.parent.isTextblock) return false
        if (dispatch) {
          const pageBreak = this.type.create()
          tr.deleteSelection()
          const $at = tr.selection.$from
          if ($at.parentOffset === 0) {
            // At the start of a paragraph: the paragraph itself moves to the next page.
            tr.insert($at.before(), pageBreak)
          } else {
            // Elsewhere: the rest of the paragraph (an empty one at its end) starts the next page.
            tr.split($at.pos)
            tr.insert(tr.selection.$from.before(), pageBreak)
          }
          tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from)))
          tr.scrollIntoView()
        }
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() }
  },
})

/** The setup of the document in the editor. */
export function currentPageSetup(editor: Editor): PageSetup {
  return pageSetupOf(editor.state.doc)
}
