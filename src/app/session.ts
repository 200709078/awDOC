import type { Editor } from '@tiptap/core'
import { documentNode, EMPTY_DOCUMENT, replaceDocument } from '../editor/editor'
import { FormatError, type DocumentFormat } from '../formats/format'
import { formatOfName, NATIVE_FORMAT, nameWithExtension, openableFormats } from '../formats/index'
import { fileTypeOf, type FileRef, type OpenedFile, type Platform } from '../platform/platform'
import { askUnsavedChanges, showToast } from '../ui/messages'

export const UNTITLED = 'Adsız belge'

/**
 * The document in the editor: its name, the file it came from and whether it has changed since.
 * "Kaydet" writes the same file again where the platform can; otherwise, and for a format that
 * would lose something (plain text), it asks where to save an awDOC file.
 */
export class DocumentSession {
  private fileName = UNTITLED
  private format: DocumentFormat | null = null
  private ref: FileRef | undefined
  private dirty = false
  private readonly listeners = new Set<() => void>()

  constructor(private readonly editor: Editor, private readonly platform: Platform) {
    editor.on('update', () => this.setDirty(true))
  }

  /** The name to show, without the extension of awDOC's own files. */
  get name(): string {
    return this.format === NATIVE_FORMAT ? this.fileName.replace(/\.awd$/i, '') : this.fileName
  }

  get isDirty(): boolean {
    return this.dirty
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  pickFile(): void {
    this.platform.pickFile(openableFormats().map(fileTypeOf))
  }

  /** Resolves false when the user kept the document open after all. */
  async confirmLeave(): Promise<boolean> {
    if (!this.dirty) return true
    const choice = await askUnsavedChanges(this.name)
    if (choice === 'cancel') return false
    return choice === 'discard' || this.save()
  }

  async newDocument(): Promise<void> {
    if (!await this.confirmLeave()) return
    replaceDocument(this.editor, documentNode(this.editor, EMPTY_DOCUMENT))
    this.set(UNTITLED, null, undefined)
    this.editor.commands.focus('start')
  }

  /** The file is read first: one that cannot be opened never asks about the document on screen. */
  async open(file: OpenedFile): Promise<void> {
    const format = formatOfName(file.name)
    if (!format?.read) {
      showToast(`${file.name} açılamıyor: awDOC bu dosya türünü henüz tanımıyor.`)
      return
    }
    let node
    try {
      node = documentNode(this.editor, await format.read(file.data))
    } catch (error) {
      if (!(error instanceof FormatError)) console.error(error)
      showToast(error instanceof FormatError ? error.message : `${file.name} açılamadı: dosya bozulmuş olabilir.`)
      return
    }
    if (!await this.confirmLeave()) return
    replaceDocument(this.editor, node)
    this.set(file.name, format, file.ref)
    this.editor.commands.focus('start')
  }

  /** Resolves true once the document is in a file. */
  async save(): Promise<boolean> {
    if (this.format?.keepsEverything && this.format.write && this.ref !== undefined) {
      try {
        if (await this.platform.write(this.ref, await this.format.write(this.editor.getJSON()))) {
          this.setDirty(false)
          showToast(`${this.fileName} kaydedildi.`)
          return true
        }
      } catch (error) {
        console.error(error)
        showToast(`${this.fileName} kaydedilemedi; başka bir yere kaydedin.`)
      }
    }
    return this.saveAs()
  }

  async saveAs(): Promise<boolean> {
    const format = NATIVE_FORMAT
    const data = await format.write!(this.editor.getJSON())
    const name = nameWithExtension(this.fileName === UNTITLED ? 'Belge' : this.fileName, format)
    try {
      const saved = await this.platform.saveAs(name, data, fileTypeOf(format), this.ref)
      if (!saved) return false
      this.set(saved.name, format, saved.ref)
      showToast(`${saved.name} kaydedildi.`)
      return true
    } catch (error) {
      console.error(error)
      showToast('Belge kaydedilemedi.')
      return false
    }
  }

  private set(name: string, format: DocumentFormat | null, ref: FileRef | undefined): void {
    this.fileName = name
    this.format = format
    this.ref = ref
    this.dirty = false
    this.notify()
  }

  private setDirty(dirty: boolean): void {
    if (this.dirty === dirty) return
    this.dirty = dirty
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
