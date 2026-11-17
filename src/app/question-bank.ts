import type { JSONContent } from '@tiptap/core'
import { inStore, QUESTION_STORE } from '../core/store'

/**
 * A question kept on this device for later exams: the question (or a pair side by side) as the
 * document holds it, with its pictures, formulas and right choice, under a topic.
 */
export interface BankQuestion {
  readonly id: string
  readonly savedAt: number
  /** Such as "Üçgenler", "9. sınıf kümeler"; empty for none. */
  readonly topic: string
  /** The question's words, for the list and the search. */
  readonly preview: string
  /** Choices of a multiple-choice question; 0 for open-ended. */
  readonly choices: number
  /** Where it was saved from. */
  readonly source: string
  readonly block: JSONContent
}

const PREVIEW_LENGTH = 160

function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'formula') return String(node.attrs?.latex ?? '')
  return (node.content ?? []).map(textOf).join(node.type === 'doc' || node.type === 'question' ? ' ' : '')
}

/** The words of a question (the two of a pair joined), shortened for the list. */
export function previewOf(block: JSONContent): string {
  const questions = block.type === 'questionRow' ? block.content ?? [] : [block]
  const stems = questions.map(question => (question.content ?? []).filter(part => part.type !== 'choices').map(textOf).join(' ').replace(/\s+/g, ' ').trim())
  const text = stems.join(' | ') || '(boş soru)'
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text
}

function choicesOf(block: JSONContent): number {
  const questions = block.type === 'questionRow' ? block.content ?? [] : [block]
  return Math.max(0, ...questions.map(question => question.content?.find(part => part.type === 'choices')?.content?.length ?? 0))
}

/** The questions (and pairs) of a document, as they stand at its top level. */
export function questionBlocksOf(document: JSONContent): JSONContent[] {
  return (document.content ?? []).filter(block => block.type === 'question' || block.type === 'questionRow')
}

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function listBank(): Promise<BankQuestion[]> {
  try {
    const all = await inStore<BankQuestion[]>(QUESTION_STORE, 'readonly', store => store.getAll() as IDBRequest<BankQuestion[]>)
    return all.sort((a, b) => b.savedAt - a.savedAt)
  } catch (error) {
    console.error(error)
    return []
  }
}

/** Keeps the questions under `topic`; one already in the bank (the very same) is not kept twice. */
export async function addToBank(blocks: readonly JSONContent[], topic: string, source: string): Promise<{ added: number; skipped: number }> {
  const known = new Set((await listBank()).map(entry => JSON.stringify(entry.block)))
  let added = 0
  let skipped = 0
  const now = Date.now()
  for (const [index, block] of blocks.entries()) {
    const key = JSON.stringify(block)
    if (known.has(key)) {
      skipped++
      continue
    }
    known.add(key)
    const entry: BankQuestion = { id: newId(), savedAt: now + index, topic: topic.trim(), preview: previewOf(block), choices: choicesOf(block), source, block }
    await inStore(QUESTION_STORE, 'readwrite', store => store.put(entry))
    added++
  }
  return { added, skipped }
}

export async function removeFromBank(id: string): Promise<void> {
  await inStore(QUESTION_STORE, 'readwrite', store => store.delete(id))
}

/** The topics in the bank, in Turkish alphabetical order. */
export function topicsOf(entries: readonly BankQuestion[]): string[] {
  return [...new Set(entries.map(entry => entry.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))
}
