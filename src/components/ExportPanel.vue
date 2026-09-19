<script setup lang="ts">
/**
 * 导出前检查 + 下载。导出始终由原始 PDF 字节经 pdf-lib 重新拼版（矢量），
 * 不使用任何预览位图。这里用醒目确认框防止把截图当最终稿。
 */
import { computed, ref } from 'vue';
import { runPreflight } from '../lib/preflight';
import { buildBookletPdf } from '../lib/export';
import type { ImpositionResult } from '../lib/imposition';
import type { ImpositionSettings } from '../lib/paper';
import type { LoadedPdf } from '../lib/pdfRender';

const props = defineProps<{
  pdf: LoadedPdf | null;
  sourceBytes: Uint8Array | null;
  result: ImpositionResult | null;
  settings: ImpositionSettings;
  acknowledged: boolean;
}>();
const emit = defineEmits<{ (e: 'acknowledge', v: boolean): void }>();

const markBlanks = ref(true);
const exporting = ref(false);
const exportError = ref('');
const donePct = ref(0);

const report = computed(() =>
  props.result
    ? runPreflight(props.result, props.settings, props.pdf, { acknowledgedPreview: props.acknowledged })
    : null,
);

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function doExport() {
  if (!props.result || !props.sourceBytes || report.value?.hasError) return;
  exporting.value = true;
  exportError.value = '';
  donePct.value = 0;
  try {
    const bytes = await buildBookletPdf({
      sourceBytes: props.sourceBytes,
      result: props.result,
      settings: props.settings,
      markBlanks: markBlanks.value,
      onProgress: (d, t) => (donePct.value = Math.round((d / t) * 100)),
    });
    const base = (name()) || 'booklet';
    download(bytes, `${base}-拼版-${props.result.flip === 'short' ? '短边' : '长边'}-${props.result.sheetCount}张.pdf`);
  } catch (e) {
    exportError.value = `导出失败：${(e as Error).message}`;
  } finally {
    exporting.value = false;
  }
}

function name() {
  return 'booklet';
}
</script>

<template>
  <div class="card">
    <h2>导出前检查</h2>

    <div v-if="!report" class="muted small">请先导入 PDF。</div>
    <template v-else>
      <div v-for="(it, i) in report.items" :key="i" class="preflight-item" :class="it.level">
        <span class="dot"></span><span>{{ it.message }}</span>
      </div>

      <label class="checkline mt12" style="padding:8px;border:1px solid var(--line);border-radius:8px;">
        <input type="checkbox" :checked="acknowledged" @change="emit('acknowledge', ($event.target as HTMLInputElement).checked)" />
        <span>我已知晓：屏幕预览为<b>低分辨率位图</b>，仅供检查页序与方向；下载的 PDF 由原始文件<b>矢量重新拼版</b>，不会使用预览截图。</span>
      </label>

      <label class="checkline">
        <input type="checkbox" v-model="markBlanks" />
        在补白/排除位置打印可见标记（BLANK / EXCLUDED）
      </label>

      <p v-if="exportError" class="pill error" style="display:inline-block">{{ exportError }}</p>

      <div class="btn-row mt8">
        <button class="btn primary" :disabled="report.hasError || exporting" @click="doExport">
          {{ exporting ? `正在矢量拼版… ${donePct}%` : '下载最终拼版 PDF' }}
        </button>
      </div>
      <div class="hint">导出 {{ result?.sheetCount }} 张纸 × 2 面 = {{ (result?.sheetCount ?? 0) * 2 }} 个 PDF 页面。</div>
    </template>
  </div>
</template>
