import { inStore, RECENT_STORE } from '../core/store'

const MAX_RECENT = 12

/** A document the user opened or saved, and how to find its file again. */
export interface RecentDocument {
  /** Unique per file: the platform's stored reference where it is a string, else the name. */
  readonly key: string
  readonly name: string
  readonly usedAt: number
  /** What `Platform.reopen` takes: a file handle, a content address, the shell's source. */
  readonly stored: unknown
}

const keyOf = (name: string, stored: unknown) => (typeof stored === 'string' ? stored : `ad:${name}`)

export async function listRecent(): Promise<RecentDocument[]> {
  try {
    const all = await inStore<RecentDocument[]>(RECENT_STORE, 'readonly', store => store.getAll() as IDBRequest<RecentDocument[]>)
    return all.sort((a, b) => b.usedAt - a.usedAt)
  } catch {
    return []
  }
}

/** The newest first; the oldest go when there are more than twelve. */
export async function rememberRecent(name: string, stored: unknown): Promise<void> {
  try {
    await inStore(RECENT_STORE, 'readwrite', store => store.put({ key: keyOf(name, stored), name, usedAt: Date.now(), stored }))
    for (const old of (await listRecent()).slice(MAX_RECENT)) await forgetRecent(old.key)
  } catch (error) {
    console.error(error)
  }
}

export async function forgetRecent(key: string): Promise<void> {
  await inStore(RECENT_STORE, 'readwrite', store => store.delete(key)).catch(console.error)
}

export async function clearRecent(): Promise<void> {
  await inStore(RECENT_STORE, 'readwrite', store => store.clear()).catch(console.error)
}
