import type { Editor } from '@tiptap/core'
import { searchState } from '../editor/search'

/**
 * The find bar under the toolbar, with a second row for replacing. Every match is marked in the
 * document; Enter goes to the next one, Shift+Enter to the one before, Esc closes and clears.
 */
export class SearchBar {
  private readonly root = document.querySelector<HTMLElement>('#searchBar')!
  private readonly input = document.querySelector<HTMLInputElement>('#searchInput')!
  private readonly replaceInput = document.querySelector<HTMLInputElement>('#replaceInput')!
  private readonly replaceRow = document.querySelector<HTMLElement>('#replaceRow')!
  private readonly status = document.querySelector<HTMLElement>('#searchStatus')!
  private readonly listeners = new Set<() => void>()

  constructor(private readonly editor: Editor) {
    this.input.addEventListener('input', () => {
      editor.commands.setSearchQuery(this.input.value)
      this.show()
    })
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault()
        this.step(event.shiftKey ? -1 : 1)
      }
    })
    this.replaceInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault()
        this.replace()
      }
    })
    for (const field of [this.input, this.replaceInput]) {
      field.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          this.close()
        }
      })
    }
    document.querySelector('#searchPrevious')!.addEventListener('click', () => this.step(-1))
    document.querySelector('#searchNext')!.addEventListener('click', () => this.step(1))
    document.querySelector('#replaceOne')!.addEventListener('click', () => this.replace())
    document.querySelector('#replaceAll')!.addEventListener('click', () => this.replaceAll())
    document.querySelector('#searchClose')!.addEventListener('click', () => this.close())
    editor.on('transaction', () => {
      if (this.isOpen) this.show()
    })
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  /** Runs when the bar opens or closes. */
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  /** Opens with the selected words to find, when there are some on one line. */
  open(withReplace: boolean): void {
    const { from, to, empty } = this.editor.state.selection
    const selected = empty ? '' : this.editor.state.doc.textBetween(from, to, '\n')
    if (selected && !selected.includes('\n')) this.input.value = selected
    this.root.hidden = false
    this.replaceRow.hidden = !withReplace
    this.editor.commands.setSearchQuery(this.input.value)
    this.input.focus()
    this.input.select()
    this.show()
    this.notify()
  }

  close(): void {
    if (!this.isOpen) return
    this.root.hidden = true
    this.editor.chain().setSearchQuery('').focus().run()
    this.notify()
  }

  private step(direction: 1 | -1): void {
    this.editor.commands.goToMatch(direction)
  }

  private replace(): void {
    const { matches, current } = searchState(this.editor.state)
    const match = matches[current]
    if (!match) return
    // The first press only goes to the match when it is not selected yet, so nothing changes unseen.
    const { from, to } = this.editor.state.selection
    if (from !== match.from || to !== match.to) {
      this.editor.commands.goToMatch(0)
      return
    }
    // Two steps: the matches are counted again once the replacement is in the document, and the
    // current one is then the next match.
    this.editor.commands.replaceMatch(this.replaceInput.value)
    this.editor.commands.goToMatch(0)
  }

  private replaceAll(): void {
    const count = searchState(this.editor.state).matches.length
    if (count === 0) return
    this.editor.commands.replaceAllMatches(this.replaceInput.value)
    this.status.textContent = `${count} yer değiştirildi`
  }

  private show(): void {
    const { query, matches, current } = searchState(this.editor.state)
    this.status.textContent = !query ? '' : matches.length === 0 ? 'Bulunamadı' : `${current + 1} / ${matches.length}`
    this.status.classList.toggle('is-missing', Boolean(query) && matches.length === 0)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
