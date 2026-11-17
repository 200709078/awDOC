import type { Editor } from '@tiptap/core'
import { addToBank, listBank, questionBlocksOf, removeFromBank, topicsOf, type BankQuestion } from '../app/question-bank'
import { UNTITLED, type DocumentSession } from '../app/session'
import { foldForSearch } from '../editor/search'
import { questionBlockAt } from '../editor/question'
import { showToast } from './messages'

const DATE = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' })
const ALL_TOPICS = ''

function fillTopics(datalist: HTMLDataListElement, topics: readonly string[]): void {
  datalist.replaceChildren(...topics.map(topic => new Option(topic)))
}

/** Bankaya ekle: the question the cursor is in, or every question of the document, under a topic. */
export async function showBankAddDialog(editor: Editor, session: DocumentSession): Promise<void> {
  const dialog = document.querySelector<HTMLDialogElement>('#bankAddDialog')!
  const topic = document.querySelector<HTMLInputElement>('#bankAddTopic')!
  const current = questionBlockAt(editor.state.selection.$from)
  const all = questionBlocksOf(editor.getJSON())
  if (!all.length) {
    showToast('Belgede soru yok: önce Sınav ▾ ile bir soru ekleyin.')
    return
  }
  const one = dialog.querySelector<HTMLInputElement>('input[value="one"]')!
  const every = dialog.querySelector<HTMLInputElement>('input[value="all"]')!
  one.disabled = !current
  one.checked = Boolean(current)
  every.checked = !current
  document.querySelector('#bankAddAll')!.textContent = `Belgedeki bütün sorular (${all.length})`
  fillTopics(document.querySelector<HTMLDataListElement>('#bankTopics')!, topicsOf(await listBank()))
  dialog.onclose = async () => {
    editor.commands.focus()
    if (dialog.returnValue !== 'add') return
    const blocks = every.checked || !current ? all : [current.node.toJSON() as object]
    const source = session.name === UNTITLED ? '' : session.name
    const { added, skipped } = await addToBank(blocks, topic.value, source)
    showToast(added ? `${added} soru bankaya eklendi${skipped ? `; ${skipped} soru zaten vardı` : ''}.` : 'Bu sorular bankada zaten var.')
  }
  dialog.returnValue = ''
  dialog.showModal()
  topic.select()
}

/**
 * Soru bankası: the questions kept on this device, newest first, with a search (Turkish letters
 * folded as in Bul) and a topic filter. "Ekle" puts one in the document and leaves the window open.
 */
export async function showBankDialog(editor: Editor, session: DocumentSession): Promise<void> {
  const dialog = document.querySelector<HTMLDialogElement>('#bankDialog')!
  const search = document.querySelector<HTMLInputElement>('#bankSearch')!
  const topicSelect = document.querySelector<HTMLSelectElement>('#bankTopic')!
  const list = document.querySelector<HTMLElement>('#bankList')!
  const empty = document.querySelector<HTMLElement>('#bankEmpty')!
  const exportButton = document.querySelector<HTMLButtonElement>('#bankExport')!
  let entries = await listBank()
  let shown: BankQuestion[] = []

  const fillTopicSelect = () => {
    const chosen = topicSelect.value
    topicSelect.replaceChildren(new Option('Tümü', ALL_TOPICS), ...topicsOf(entries).map(topic => new Option(topic)))
    topicSelect.value = [...topicSelect.options].some(option => option.value === chosen) ? chosen : ALL_TOPICS
  }

  const draw = () => {
    const words = foldForSearch(search.value.trim()).split(/\s+/).filter(Boolean)
    shown = entries.filter(entry => {
      if (topicSelect.value !== ALL_TOPICS && entry.topic !== topicSelect.value) return false
      const text = foldForSearch(`${entry.preview} ${entry.topic}`)
      return words.every(word => text.includes(word))
    })
    empty.hidden = shown.length > 0
    empty.textContent = entries.length ? 'Aramaya uyan soru yok.' : 'Banka boş. Bir sorunun içindeyken Sınav ▾ → "Bankaya ekle…" ile soru saklayın.'
    exportButton.disabled = shown.length === 0
    list.replaceChildren(...shown.map(entry => {
      const item = document.createElement('div')
      item.className = 'bank-item'
      const text = document.createElement('div')
      text.className = 'bank-item__text'
      const preview = document.createElement('div')
      preview.className = 'bank-item__preview'
      preview.textContent = entry.preview
      const meta = document.createElement('div')
      meta.className = 'bank-item__meta'
      meta.textContent = [entry.topic, entry.choices ? `${entry.choices} şıklı` : 'açık uçlu', DATE.format(entry.savedAt)].filter(Boolean).join(' · ')
      text.append(preview, meta)
      const add = document.createElement('button')
      add.type = 'button'
      add.className = 'primary-button'
      add.textContent = 'Ekle'
      add.addEventListener('click', () => {
        if (editor.commands.insertQuestionBlock(entry.block)) showToast('Soru belgeye eklendi.')
        else showToast('Bu soru eklenemedi.')
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'secondary-button'
      remove.textContent = 'Sil'
      // Gone for good: a second press confirms.
      remove.addEventListener('click', async () => {
        if (remove.dataset.sure !== 'evet') {
          remove.dataset.sure = 'evet'
          remove.textContent = 'Silinsin mi?'
          return
        }
        await removeFromBank(entry.id)
        entries = entries.filter(other => other.id !== entry.id)
        fillTopicSelect()
        draw()
      })
      item.append(text, add, remove)
      return item
    }))
  }

  search.value = ''
  search.oninput = draw
  topicSelect.onchange = draw
  fillTopicSelect()
  draw()
  dialog.onclose = async () => {
    if (dialog.returnValue === 'export' && shown.length) {
      const content = [...shown.map(entry => entry.block), { type: 'paragraph' }]
      if (await session.newDocument({ type: 'doc', content }, 'Soru bankası')) showToast(`${shown.length} soru yeni belgede açıldı.`)
      return
    }
    editor.commands.focus()
  }
  dialog.returnValue = ''
  dialog.showModal()
  search.focus()
}
