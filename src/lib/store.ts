/**
 * 应用级响应式状态：源 PDF、排除页（带撤销/重做）、纸张设置（持久化 IndexedDB）、
 * 拼版结果（computed）、导出前确认。预览渲染缓存只存低分辨率位图，绝不参与导出。
 */
import { computed, ref, shallowRef, watch } from 'vue';
import { impose, type ImpositionResult } from './imposition';
import { loadPdf, renderPreview, type LoadedPdf } from './pdfRender';
import { loadSettings, saveSettings, saveDocMeta, clearDocMeta } from './storage';
import { useAdjustHistory } from './history';
import { DEFAULT_SETTINGS, type ImpositionSettings } from './paper';

export interface Thumb {
  page: number;
  url: string | null;
  loading: boolean;
}

export function useStore() {
  const settings = ref<ImpositionSettings>(structuredClone(DEFAULT_SETTINGS));
  const pdf = shallowRef<LoadedPdf | null>(null);
  const sourceBytes = shallowRef<Uint8Array | null>(null);
  const fileName = ref<string>('');
  const thumbs = ref<Thumb[]>([]);
  const loadError = ref<string>('');
  const busy = ref(false);
  const acknowledgedPreview = ref(false);

  const history = useAdjustHistory(new Set());
  const excluded = computed(() => new Set(history.present.value.excluded));

  const result = computed<ImpositionResult | null>(() =>
    pdf.value ? impose(pdf.value.pageCount, excluded.value, settings.value.flip) : null,
  );

  async function init() {
    settings.value = await loadSettings();
    watch(settings, (s) => void saveSettings(s), { deep: true });
  }

  async function importFile(file: File) {
    loadError.value = '';
    busy.value = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await loadPdf(bytes);
      pdf.value = loaded;
      sourceBytes.value = bytes;
      fileName.value = file.name;
      history.commit(new Set());
      acknowledgedPreview.value = false;
      thumbs.value = loaded.pageSizes.map((_, i) => ({ page: i + 1, url: null, loading: false }));
      await saveDocMeta({ fileName: file.name, pageCount: loaded.pageCount, excludedPages: [], savedAt: Date.now() });
      void loadThumbs();
    } catch (e) {
      loadError.value = `无法解析该 PDF：${(e as Error).message}`;
    } finally {
      busy.value = false;
    }
  }

  // 渲染低分辨率缩略图（仅屏幕显示）。逐页串行，避免一次性占满内存。
  let thumbSeq = 0;
  async function loadThumbs() {
    const doc = pdf.value;
    if (!doc) return;
    const seq = ++thumbSeq;
    for (let i = 0; i < thumbs.value.length; i++) {
      if (seq !== thumbSeq) return;
      if (thumbs.value[i].url) continue;
      thumbs.value[i].loading = true;
      try {
        const canvas = await renderPreview(doc.doc, i + 1, 220);
        if (seq !== thumbSeq) return;
        thumbs.value[i].url = canvas.toDataURL('image/png');
      } finally {
        if (thumbs.value[i]) thumbs.value[i].loading = false;
      }
    }
  }

  function toggleExclude(page: number) {
    const next = new Set(excluded.value);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    history.commit(next);
    void persistDocMeta(next);
  }

  function undo() {
    const s = history.undo();
    if (s) void persistDocMeta(new Set(s.excluded));
  }
  function redo() {
    const s = history.redo();
    if (s) void persistDocMeta(new Set(s.excluded));
  }

  async function persistDocMeta(set: Set<number>) {
    if (!pdf.value) return;
    await saveDocMeta({
      fileName: fileName.value,
      pageCount: pdf.value.pageCount,
      excludedPages: [...set].sort((a, b) => a - b),
      savedAt: Date.now(),
    });
  }

  function clearDocument() {
    pdf.value = null;
    sourceBytes.value = null;
    fileName.value = '';
    thumbs.value = [];
    history.commit(new Set());
    void clearDocMeta();
  }

  return {
    settings, pdf, sourceBytes, fileName, thumbs, loadError, busy,
    excluded, result, history, acknowledgedPreview,
    init, importFile, loadThumbs, toggleExclude, undo, redo, clearDocument,
  };
}
