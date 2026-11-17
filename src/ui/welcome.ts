import type { Editor } from '@tiptap/core'
import { clearRecent, listRecent } from '../app/recent'
import { dropRecovery, type RecoveryCopy } from '../app/recovery'
import type { DocumentSession } from '../app/session'
import { askRestore } from './dialogs'
import { showExamDialog } from './exam-dialog'
import type { PageView } from './page-view'

const AT_START_KEY = 'awDOC.girisEkrani'
const DATE = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

/** Whether the welcome screen opens with the app (the user may turn it off on the screen itself). */
export function welcomeAtStart(): boolean {
  try {
    return localStorage.getItem(AT_START_KEY) !== 'kapali'
  } catch {
    return true
  }
}

/**
 * The welcome screen, as awPDF's first screen: the logo, Yeni Belge, Sınav Kâğıdı and Belge Aç,
 * work left unsaved last time, and the recent documents. It opens with the app (unless turned off)
 * and from ☰ → Giriş Ekranı; any new document closes it (new, opened, restored, a template), and so
 * does an edit made with a tool while it shows.
 */
export class Welcome {
  private readonly screen = document.querySelector<HTMLElement>('#welcome')!
  private readonly workspace = document.querySelector<HTMLElement>('#workspace')!
  private recovery: RecoveryCopy | null = null
  private readonly listeners = new Set<() => void>()

  constructor(private readonly editor: Editor, private readonly session: DocumentSession, private readonly pageView: PageView) {
    document.querySelector('#welcomeNew')!.addEventListener('click', () => { void session.newDocument() })
    document.querySelector('#welcomeExam')!.addEventListener('click', () => showExamDialog(editor, session))
    document.querySelector('#welcomeOpen')!.addEventListener('click', () => session.pickFile())
    document.querySelector('#welcomeBack')!.addEventListener('click', () => this.hide())
    document.querySelector('#welcomeRestore')!.addEventListener('click', () => {
      const copy = this.recovery
      this.recovery = null
      if (copy) session.restore(copy)
    })
    document.querySelector('#welcomeDiscard')!.addEventListener('click', () => {
      this.recovery = null
      void dropRecovery()
      this.drawRecovery()
    })
    document.querySelector('#welcomeRecentClear')!.addEventListener('click', () => {
      void clearRecent().then(() => this.drawRecent())
    })
    const atStart = document.querySelector<HTMLInputElement>('#welcomeAtStart')!
    atStart.checked = welcomeAtStart()
    atStart.addEventListener('change', () => {
      try {
        localStorage.setItem(AT_START_KEY, atStart.checked ? 'acik' : 'kapali')
      } catch {
        // Only not remembered.
      }
    })
    session.onDocument(() => this.hide())
    editor.on('update', () => this.hide())
  }

  get isOpen(): boolean {
    return !this.screen.hidden
  }

  /** Opened over a document (☰ → Giriş Ekranı): "Belgeye Dön" leads back to it. */
  show(overDocument: boolean): void {
    document.querySelector<HTMLElement>('#welcomeBack')!.hidden = !overDocument
    this.screen.hidden = false
    this.workspace.classList.add('is-welcome')
    this.drawRecovery()
    void this.drawRecent()
    this.screen.querySelector<HTMLElement>('#welcomeNew')!.focus()
    this.notify()
  }

  hide(): void {
    if (!this.isOpen) return
    this.screen.hidden = true
    this.workspace.classList.remove('is-welcome')
    this.pageView.remeasure()
    this.editor.commands.focus()
    this.notify()
    // Work left unsaved must not be lost because another document came first: asked as before.
    const copy = this.recovery
    this.recovery = null
    if (copy) {
      void askRestore(copy).then(restore => {
        if (restore) this.session.restore(copy)
        else void dropRecovery()
      })
    }
  }

  /** Work left unsaved when the app was last closed, offered on the screen instead of a window. */
  offerRecovery(copy: RecoveryCopy): void {
    this.recovery = copy
    this.drawRecovery()
  }

  /** Android's back button: back to the document the screen was opened over; at start, nothing (the app goes). */
  closeOnBack(): boolean {
    if (!this.isOpen || document.querySelector<HTMLElement>('#welcomeBack')!.hidden) return false
    this.hide()
    return true
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private drawRecovery(): void {
    const card = document.querySelector<HTMLElement>('#welcomeRecovery')!
    card.hidden = this.recovery === null
    if (this.recovery) {
      document.querySelector('#welcomeRecoveryText')!.textContent = `Kaydedilmemiş belge bulundu: "${this.recovery.name}" (${DATE.format(this.recovery.savedAt)}).`
    }
  }

  private async drawRecent(): Promise<void> {
    const entries = await listRecent()
    const box = document.querySelector<HTMLElement>('#welcomeRecent')!
    box.hidden = entries.length === 0
    document.querySelector<HTMLElement>('#welcomeRecentList')!.replaceChildren(...entries.map(entry => {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'recent-item'
      const name = document.createElement('span')
      name.className = 'recent-item__name'
      name.textContent = entry.name.replace(/\.awd$/i, '')
      const date = document.createElement('span')
      date.className = 'recent-item__date'
      date.textContent = DATE.format(entry.usedAt)
      item.append(name, date)
      item.addEventListener('click', () => { void this.session.openRecent(entry) })
      return item
    }))
  }
}
