/**
 * 工程参数持久化到 IndexedDB（纯浏览器，无服务端数据库）。
 * 保存内容：纸张/装订设置、排除页、最近一次源文件名与页数。
 * 导入的 PDF 本身不入库（体积大且无必要），只保留元信息。
 */
import { openDB, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type ImpositionSettings } from './paper';

const DB_NAME = 'booklet-imposition';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY_SETTINGS = 'settings';
const KEY_DOC = 'doc-meta';

export interface DocMeta {
  fileName: string;
  pageCount: number;
  excludedPages: number[];
  savedAt: number;
}

interface Schema {
  kv: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export async function loadSettings(): Promise<ImpositionSettings> {
  try {
    const raw = (await (await db()).get(STORE, KEY_SETTINGS)) as Partial<ImpositionSettings> | undefined;
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    // 合并默认值，保证旧版本数据缺少字段时可用
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...raw,
      trim: { ...DEFAULT_SETTINGS.trim, ...(raw.trim ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(s: ImpositionSettings): Promise<void> {
  await (await db()).put(STORE, s as unknown as Schema['kv']['value'], KEY_SETTINGS);
}

export async function loadDocMeta(): Promise<DocMeta | null> {
  try {
    return ((await (await db()).get(STORE, KEY_DOC)) as DocMeta | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveDocMeta(m: DocMeta): Promise<void> {
  await (await db()).put(STORE, m as unknown as Schema['kv']['value'], KEY_DOC);
}

export async function clearDocMeta(): Promise<void> {
  await (await db()).delete(STORE, KEY_DOC);
}
