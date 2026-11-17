import type { Editor, JSONContent } from '@tiptap/core'
import { documentNode, EMPTY_DOCUMENT, replaceDocument } from '../editor/editor'
import { FormatError, type DocumentFormat } from '../formats/format'
import { formatOfName, NATIVE_FORMAT, nameWithExtension, openableFormats } from '../formats/index'
import { fileTypeOf, type FileRef, type OpenedFile, type Platform } from '../platform/platform'
import { askUnsavedChanges, showToast } from '../ui/messages'
import { forgetRecent, rememberRecent, type RecentDocument } from './recent'
import { dropRecovery, keepRecovery, type RecoveryCopy } from './recovery'

export const UNTITLED = 'Adsız belge'
/** A pause in typing this long, and the recovery copy is taken. */
const RECOVERY_DELAY_MS = 2000
/** A pause in typing this long, and the file is written (Otomatik Kaydet). */
const AUTO_SAVE_DELAY_MS = 4000
const AUTO_SAVE_KEY = 'awDOC.otomatikKaydet'

function storedAutoSave(): boolean {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) !== 'kapali'
  } catch {
    return true
  }
}

/**
 * The document in the editor: its name, the file it came from and whether it has changed since.
 * "Kaydet" writes the same file again where the platform can; otherwise, and for a format that
 * would lose something (plain text), it asks where to save an awDOC file. While there are unsaved
 * changes a recovery copy stays on the device; with Otomatik Kaydet the file itself is written
 * after a pause in typing.
 */
export class DocumentSession {
  private fileName = UNTITLED
  private format: DocumentFormat | null = null
  private ref: FileRef | undefined
  private dirty = false
  private autoSave = storedAutoSave()
  /** Set when writing on its own failed; the user saves by hand until another document comes. */
  private autoSaveFailed = false
  private writing: Promise<boolean> | undefined
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined
  private autoSaveTimer: ReturnType<typeof setTimeout> | undefined
  private readonly listeners = new Set<() => void>()

  constructor(private readonly editor: Editor, private readonly platform: Platform) {
    editor.on('update', () => {
      this.setDirty(true)
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = setTimeout(() => this.keepRecoveryCopy(), RECOVERY_DELAY_MS)
      clearTimeout(this.autoSaveTimer)
      if (this.autoSave && this.canWriteBack) this.autoSaveTimer = setTimeout(() => { void this.saveQuietly() }, AUTO_SAVE_DELAY_MS)
    })
  }

  /** The name to show, without the extension of awDOC's own files. */
  get name(): string {
    return this.format === NATIVE_FORMAT ? this.fileName.replace(/\.awd$/i, '') : this.fileName
  }

  get isDirty(): boolean {
    return this.dirty
  }

  get isAutoSaving(): boolean {
    return this.autoSave
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  pickFile(): void {
    this.platform.pickFile(openableFormats().map(fileTypeOf))
  }

  toggleAutoSave(): void {
    this.autoSave = !this.autoSave
    try {
      localStorage.setItem(AUTO_SAVE_KEY, this.autoSave ? 'acik' : 'kapali')
    } catch {
      // Private windows may refuse; the choice still holds for this visit.
    }
    if (this.autoSave && this.dirty && this.canWriteBack) void this.saveQuietly()
    this.notify()
  }

  /** Resolves false when the user kept the document open after all. */
  async confirmLeave(): Promise<boolean> {
    if (!this.dirty) return true
    const choice = await askUnsavedChanges(this.name)
    if (choice === 'cancel') return false
    return choice === 'discard' || this.save()
  }

  /** Yeni: an empty document, or one made from a template (a new exam paper). False when the user stayed. */
  async newDocument(content: JSONContent = EMPTY_DOCUMENT): Promise<boolean> {
    if (!await this.confirmLeave()) return false
    replaceDocument(this.editor, documentNode(this.editor, content))
    this.set(UNTITLED, null, undefined)
    this.editor.commands.focus('start')
    return true
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
    this.remember()
    this.editor.commands.focus('start')
  }

  /** From the recent list; a file that is gone leaves the list. */
  async openRecent(entry: RecentDocument): Promise<void> {
    const file = await this.platform.reopen(entry.stored).catch(() => null)
    if (!file) {
      showToast(`${entry.name} bulunamadı ya da açma izni yok; listeden çıkarıldı.`)
      await forgetRecent(entry.key)
      return
    }
    await this.open(file)
  }

  /** Brings back the copy kept before the app was closed; it still has to be saved. */
  restore(copy: RecoveryCopy): void {
    replaceDocument(this.editor, documentNode(this.editor, copy.document))
    this.set(copy.name, null, undefined)
    this.setDirty(true)
    void keepRecovery(copy)
    this.editor.commands.focus('end')
  }

  /** Resolves true once the document is in a file. */
  async save(): Promise<boolean> {
    if (this.canWriteBack) {
      try {
        if (await this.writeBack()) {
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
      this.remember()
      showToast(`${saved.name} kaydedildi.`)
      return true
    } catch (error) {
      console.error(error)
      showToast('Belge kaydedilemedi.')
      return false
    }
  }

  /** PDF Olarak Kaydet: a file on the desktop; elsewhere the print dialog's own "Save as PDF". */
  async exportPdf(): Promise<void> {
    const name = `${this.fileName === UNTITLED ? 'Belge' : this.name.replace(/\.[^.]+$/, '')}.pdf`
    if (!this.platform.exportPdf) {
      showToast('Açılan yazdırma penceresinde yazıcı olarak "PDF olarak kaydet"i seçin.')
      this.platform.print()
      return
    }
    try {
      const saved = await this.platform.exportPdf(name, this.ref)
      if (saved) showToast(`${saved} kaydedildi.`)
    } catch (error) {
      console.error(error)
      showToast('PDF kaydedilemedi.')
    }
  }

  /** Only awDOC's own files are written over: another format would lose what it cannot hold. */
  private get canWriteBack(): boolean {
    return Boolean(this.format?.keepsEverything && this.format.write && this.ref !== undefined)
  }

  /** One write at a time; the changes typed meanwhile stay unsaved until the next one. */
  private writeBack(): Promise<boolean> {
    this.writing ??= (async () => {
      const ref = this.ref
      const document = this.editor.getJSON()
      const written = await this.platform.write(ref, await this.format!.write!(document))
      // Saved only if nothing changed while the file was being written.
      if (written && ref === this.ref && JSON.stringify(document) === JSON.stringify(this.editor.getJSON())) {
        this.setDirty(false)
        void dropRecovery()
      }
      return written
    })().finally(() => { this.writing = undefined })
    return this.writing
  }

  private async saveQuietly(): Promise<void> {
    if (!this.autoSave || this.autoSaveFailed || !this.dirty || !this.canWriteBack) return
    try {
      if (await this.writeBack()) return
    } catch (error) {
      console.error(error)
    }
    this.autoSaveFailed = true
    showToast('Otomatik kaydetme yapılamadı; belgeyi Kaydet ile kaydedin.')
  }

  private keepRecoveryCopy(): void {
    if (this.dirty) void keepRecovery({ name: this.name, savedAt: Date.now(), document: this.editor.getJSON() })
  }

  private remember(): void {
    const stored = this.ref === undefined ? undefined : this.platform.storableRef(this.ref)
    if (stored !== undefined) void rememberRecent(this.fileName, stored)
  }

  private set(name: string, format: DocumentFormat | null, ref: FileRef | undefined): void {
    this.fileName = name
    this.format = format
    this.ref = ref
    this.dirty = false
    this.autoSaveFailed = false
    clearTimeout(this.recoveryTimer)
    clearTimeout(this.autoSaveTimer)
    void dropRecovery()
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
