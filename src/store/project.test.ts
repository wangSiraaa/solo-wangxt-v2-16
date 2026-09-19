import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// node 环境无 DOM/IndexedDB，mock 掉预览与持久化层
vi.mock('../pdf/preview', () => ({
  openPdf: async (_bytes: ArrayBuffer) => ({
    pageCount: 11,
    pages: Array.from({ length: 11 }, (_, i) => ({ pageNumber: i + 1, widthMm: 148, heightMm: 210 })),
    renderPage: async () => null,
    destroy: () => {},
  }),
}))
vi.mock('../db/idb', () => ({
  saveProject: vi.fn(async () => {}),
  loadProject: vi.fn(async () => null),
  clearProject: vi.fn(async () => {}),
}))

import { useProjectStore } from './project'

describe('project store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('加载 PDF 后生成拼版方案，11 页补 1 白', async () => {
    const store = useProjectStore()
    await store.loadPdf(new ArrayBuffer(8), 'test.pdf')
    expect(store.pageCount).toBe(11)
    expect(store.plan?.paddedCount).toBe(12)
    expect(store.plan?.blankPositions).toEqual([12])
  })

  it('排除页参与撤销', async () => {
    const store = useProjectStore()
    await store.loadPdf(new ArrayBuffer(8), 'test.pdf')
    store.toggleExclude(5)
    expect(store.excludedPages.has(5)).toBe(true)
    expect(store.plan?.includedPages).not.toContain(5)
    expect(store.canUndo).toBe(true)
    store.undo()
    expect(store.excludedPages.size).toBe(0)
    expect(store.plan?.includedPages).toContain(5)
  })

  it('修改纸张/翻转设置可撤销', async () => {
    const store = useProjectStore()
    await store.loadPdf(new ArrayBuffer(8), 'test.pdf')
    store.updateSettings({ duplexFlip: 'short-edge' })
    expect(store.plan?.sheets[0].back.rotated).toBe(true)
    store.undo()
    expect(store.settings.duplexFlip).toBe('long-edge')
    expect(store.plan?.sheets[0].back.rotated).toBe(false)
  })

  it('封面单独计纸后封面页从正文移除', async () => {
    const store = useProjectStore()
    await store.loadPdf(new ArrayBuffer(8), 'test.pdf')
    store.updateSettings({ separateCover: true })
    const plan = store.plan!
    expect(plan.coverSheetCount).toBe(1)
    const coverPages = [
      plan.sheets[0].front.left.page,
      plan.sheets[0].front.right.page,
      plan.sheets[0].back.left.page,
      plan.sheets[0].back.right.page,
    ]
    expect(coverPages.sort((a, b) => a! - b!)).toEqual([1, 2, 10, 11])
  })
})
