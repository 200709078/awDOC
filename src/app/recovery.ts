import type { JSONContent } from '@tiptap/core'
import { inStore, RECOVERY_STORE } from '../core/store'

const KEY = 'belge'

/** The last unsaved state of the document, kept on the device in case the app is closed or killed. */
export interface RecoveryCopy {
  readonly name: string
  readonly savedAt: number
  readonly document: JSONContent
}

export async function keepRecovery(copy: RecoveryCopy): Promise<void> {
  await inStore(RECOVERY_STORE, 'readwrite', store => store.put(copy, KEY)).catch(console.error)
}

export async function readRecovery(): Promise<RecoveryCopy | undefined> {
  try {
    const copy = await inStore<RecoveryCopy | undefined>(RECOVERY_STORE, 'readonly', store => store.get(KEY) as IDBRequest<RecoveryCopy | undefined>)
    return copy?.document?.type === 'doc' ? copy : undefined
  } catch {
    return undefined
  }
}

export async function dropRecovery(): Promise<void> {
  await inStore(RECOVERY_STORE, 'readwrite', store => store.delete(KEY)).catch(console.error)
}
