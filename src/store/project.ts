import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { computeImposition } from '../imposition/impose'
import { DEFAULT_SETTINGS, type ImpositionSettings } from '../types'
import { openPdf, type PdfDocument } from '../pdf/preview'
import { loadProject, saveProject, clearProject } from '../db/idb'

interface Snapshot {
  settings: ImpositionSettings
  excludedPages: number[]
}

export const useProjectStore = defineStore('project', () => {
  const settings = ref<ImpositionSettings>({ ...DEFAULT_SETTINGS })
  const excludedPages = ref<Set<number>>(new Set())
  const fileName = ref<string | null>(null)
  const pdfBytes = ref<ArrayBuffer | null>(null)
  const pdfDoc = ref<PdfDocument | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---- 撤销 ----
  const undoStack = ref<Snapshot[]>([])
  const canUndo = computed(() => undoStack.value.length > 0)

  function snapshot(): Snapshot {
    return {
      settings: { ...settings.value },
      excludedPages: [...excludedPages.value],
    }
  }

  /** 在任何可调参数变更前调用 */
  function commit() {
    undoStack.value.push(snapshot())
    if (undoStack.value.length > 50) undoStack.value.shift()
  }

  function undo() {
    const prev = undoStack.value.pop()
    if (!prev) return
    settings.value = { ...prev.settings }
    excludedPages.value = new Set(prev.excludedPages)
  }

  // ---- 拼版计算 ----
  const plan = computed(() => {
    if (!pdfDoc.value) return null
    return computeImposition(
      pdfDoc.value.pageCount,
      excludedPages.value,
      settings.value.separateCover,
      settings.value.duplexFlip,
    )
  })

  // ---- 文件 ----
  async function loadPdf(bytes: ArrayBuffer, name: string) {
    loading.value = true
    error.value = null
    try {
      pdfDoc.value?.destroy()
      pdfDoc.value = await openPdf(bytes.slice(0))
      pdfBytes.value = bytes
      fileName.value = name
      excludedPages.value = new Set()
      undoStack.value = []
    } catch (e) {
      error.value = `PDF 解析失败：${e instanceof Error ? e.message : String(e)}`
    } finally {
      loading.value = false
    }
  }

  const pageCount = computed(() => pdfDoc.value?.pageCount ?? 0)

  async function loadFile(file: File) {
    await loadPdf(await file.arrayBuffer(), file.name)
  }

  async function loadSample(pages: number) {
    loading.value = true
    error.value = null
    try {
      const { generateSamplePdf } = await import('../pdf/sample')
      const bytes = await generateSamplePdf(pages)
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      await loadPdf(buf, `样册-${pages}页.pdf`)
    } catch (e) {
      error.value = `样册生成失败：${e instanceof Error ? e.message : String(e)}`
      loading.value = false
    }
  }

  function toggleExclude(page: number) {    commit()
    const s = new Set(excludedPages.value)
    if (s.has(page)) s.delete(page)
    else s.add(page)
    excludedPages.value = s
  }

  function updateSettings(patch: Partial<ImpositionSettings>) {
    commit()
    Object.assign(settings.value, patch)
  }

  async function reset() {
    pdfDoc.value?.destroy()
    pdfDoc.value = null
    pdfBytes.value = null
    fileName.value = null
    excludedPages.value = new Set()
    undoStack.value = []
    settings.value = { ...DEFAULT_SETTINGS }
    await clearProject()
  }

  // ---- IndexedDB 持久化（防抖） ----
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(
    [settings, excludedPages, pdfBytes, fileName],
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        saveProject({
          version: 1,
          fileName: fileName.value,
          pdfBytes: pdfBytes.value,
          settings: settings.value,
          excludedPages: [...excludedPages.value],
          savedAt: Date.now(),
        }).catch(() => {})
      }, 400)
    },
    { deep: true },
  )

  async function restore() {
    try {
      const saved = await loadProject()
      if (!saved) return
      if (saved.settings) settings.value = { ...DEFAULT_SETTINGS, ...(saved.settings as ImpositionSettings) }
      excludedPages.value = new Set(saved.excludedPages ?? [])
      if (saved.pdfBytes && saved.fileName) {
        await loadPdf(saved.pdfBytes, saved.fileName)
        // loadPdf 会清空排除页与撤销栈，恢复保存的值
        excludedPages.value = new Set(saved.excludedPages ?? [])
      }
    } catch {
      /* 损坏的存档直接忽略 */
    }
  }

  return {
    settings,
    excludedPages,
    fileName,
    pdfBytes,
    pdfDoc,
    loading,
    error,
    plan,
    pageCount,
    canUndo,
    commit,
    undo,
    loadPdf,
    loadFile,
    loadSample,
    toggleExclude,
    updateSettings,
    reset,
    restore,
  }
})
