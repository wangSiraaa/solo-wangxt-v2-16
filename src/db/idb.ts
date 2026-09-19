/** 极简 IndexedDB 封装：单库单表，按 key 存取工程参数 */
const DB_NAME = 'booklet-imposition'
const STORE = 'projects'
const KEY = 'current'

export interface PersistedProject {
  version: 1
  fileName: string | null
  /** 原 PDF 字节，便于刷新后恢复 */
  pdfBytes: ArrayBuffer | null
  settings: unknown
  excludedPages: number[]
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveProject(data: PersistedProject): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(data, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadProject(): Promise<PersistedProject | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve((req.result as PersistedProject | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function clearProject(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
