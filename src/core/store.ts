/**
 * The app's own storage on this device (IndexedDB): it can keep a browser's file handles, which
 * localStorage cannot. Nothing here leaves the device. Every call may fail (a private window, a
 * full disk); callers treat the store as a convenience, never as the document's only copy.
 */
const DATABASE = 'awDOC'
/** 2: the question bank (2026-11-17). */
const VERSION = 2
export const RECENT_STORE = 'recent'
export const RECOVERY_STORE = 'recovery'
export const QUESTION_STORE = 'questions'

let opened: Promise<IDBDatabase> | undefined

function database(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    // Each version adds what it needs; what an older version made is kept.
    request.onupgradeneeded = () => {
      const stores = request.result.objectStoreNames
      if (!stores.contains(RECENT_STORE)) request.result.createObjectStore(RECENT_STORE, { keyPath: 'key' })
      if (!stores.contains(RECOVERY_STORE)) request.result.createObjectStore(RECOVERY_STORE)
      if (!stores.contains(QUESTION_STORE)) request.result.createObjectStore(QUESTION_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(error => {
    opened = undefined
    throw error
  })
  return opened
}

export async function inStore<T>(store: string, mode: IDBTransactionMode, work: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const connection = await database()
  return new Promise<T>((resolve, reject) => {
    const transaction = connection.transaction(store, mode)
    const request = work(transaction.objectStore(store))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error ?? request.error)
    transaction.onabort = () => reject(transaction.error ?? request.error)
  })
}
