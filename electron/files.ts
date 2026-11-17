import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** What the page may open and save (src/formats/index.ts); anything else is refused. */
export const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set(['awd', 'txt'])
/** A document this large is not a text document; reading it whole would only freeze the app. */
const MAX_BYTES = 200 * 1024 * 1024
/** Lasting names for paths, for the recent list; the oldest go first. */
const MAX_SOURCES = 100

interface SaveType {
  extension: string
  description: string
}

export interface OpenedFile {
  id: number
  name: string
  data: Uint8Array
  /** Stands for the path, which the page never learns; `files:reopen` accepts only these. */
  source: string
}

const extensionOf = (filePath: string) => path.extname(filePath).slice(1).toLowerCase()

/**
 * The page has no access to the disk. It gets the files the user gave the app (a double click, a
 * picker, a drop), and writes again only those, by the numbers handed out here.
 */
export class DesktopFiles {
  /** Where each file is; never sent to the page. */
  private readonly paths = new Map<number, string>()
  private lastId = 0
  private sources: Record<string, string> = {}
  private readonly sourcesPath = path.join(app.getPath('userData'), 'belgeler.json')
  private readonly loaded = readFile(this.sourcesPath, 'utf8').then(
    text => { this.sources = JSON.parse(text) as Record<string, string> },
    () => undefined,
  )

  async open(filePath: string): Promise<OpenedFile> {
    if (!DOCUMENT_EXTENSIONS.has(extensionOf(filePath))) throw new Error(`Desteklenmeyen dosya: ${filePath}`)
    if ((await stat(filePath)).size > MAX_BYTES) throw new Error(`Dosya çok büyük: ${filePath}`)
    const data = new Uint8Array(await readFile(filePath))
    return { id: this.remember(filePath), name: path.basename(filePath), data, source: await this.sourceOf(filePath) }
  }

  register(): void {
    ipcMain.handle('files:adopt', (_event, filePath: unknown) => {
      return typeof filePath === 'string' ? this.open(filePath).catch(() => null) : null
    })
    ipcMain.handle('files:write', async (_event, id: unknown, data: unknown) => {
      const filePath = this.paths.get(id as number)
      if (!filePath || !(data instanceof Uint8Array)) return false
      await this.writeSafely(filePath, data)
      return true
    })
    ipcMain.handle('files:reopen', async (_event, source: unknown) => {
      await this.loaded
      const filePath = typeof source === 'string' ? this.sources[source] : undefined
      return filePath ? this.open(filePath).catch(() => null) : null
    })
    // The page as printed (only the document, A4 from its @page rule), saved where the user chooses.
    ipcMain.handle('files:export-pdf', async (event, name: unknown, nearId: unknown) => {
      if (typeof name !== 'string') throw new Error('Ad yok.')
      const pdf = await event.sender.printToPDF({ printBackground: true, preferCSSPageSize: true })
      return this.saveAs(BrowserWindow.fromWebContents(event.sender), name, new Uint8Array(pdf), nearId, { extension: 'pdf', description: 'PDF belgesi' }, false)
    })
    ipcMain.handle('files:save-as', (event, name: unknown, data: unknown, nearId: unknown, type: unknown) => {
      if (typeof name !== 'string' || !(data instanceof Uint8Array)) throw new Error('Kaydedilecek dosya yok.')
      const { extension, description } = (type ?? {}) as Partial<SaveType>
      if (typeof extension !== 'string' || !DOCUMENT_EXTENSIONS.has(extension) || typeof description !== 'string') throw new Error('Bu tür kaydedilemez.')
      return this.saveAs(BrowserWindow.fromWebContents(event.sender), name, data, nearId, { extension, description })
    })
  }

  private remember(filePath: string): number {
    const known = [...this.paths].find(([, open]) => path.resolve(open) === path.resolve(filePath))
    if (known) return known[0]
    const id = ++this.lastId
    this.paths.set(id, filePath)
    return id
  }

  /** Into a file beside it first, then in its place: a crash halfway never leaves half a document. */
  private async writeSafely(filePath: string, data: Uint8Array): Promise<void> {
    const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.yaziliyor`)
    await writeFile(temporary, data)
    await rename(temporary, filePath)
  }

  private async sourceOf(filePath: string): Promise<string> {
    await this.loaded
    const known = Object.keys(this.sources).find(source => this.sources[source] === filePath)
    if (known) return known
    const source = randomUUID()
    this.sources[source] = filePath
    for (const oldest of Object.keys(this.sources).slice(0, -MAX_SOURCES)) delete this.sources[oldest]
    await writeFile(this.sourcesPath, JSON.stringify(this.sources)).catch(console.error)
    return source
  }

  /** `keep` false: an exported copy (PDF) the page will never write again, so it gets no number. */
  private async saveAs(window: BrowserWindow | null, name: string, data: Uint8Array, nearId: unknown, type: SaveType, keep = true): Promise<{ id: number; name: string; source: string } | { name: string } | null> {
    const near = this.paths.get(nearId as number)
    const options = {
      defaultPath: path.join(near ? path.dirname(near) : app.getPath('documents'), path.basename(name)),
      filters: [{ name: type.description, extensions: [type.extension] }],
    }
    const { canceled, filePath } = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null
    const target = filePath.toLowerCase().endsWith(`.${type.extension}`) ? filePath : `${filePath}.${type.extension}`
    await this.writeSafely(target, data)
    if (!keep) return { name: path.basename(target) }
    return { id: this.remember(target), name: path.basename(target), source: await this.sourceOf(target) }
  }
}
