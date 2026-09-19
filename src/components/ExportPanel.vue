<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore } from '../store/project'
import { runPreflightChecks } from '../pdf/preflight'
import { exportImposedPdf } from '../pdf/exporter'

const store = useProjectStore()
const exporting = ref(false)
const exported = ref(false)

const checks = computed(() =>
  runPreflightChecks(
    store.plan,
    store.settings,
    store.pdfDoc?.pages ?? [],
    store.excludedPages.size,
  ),
)
const hasError = computed(() => checks.value.some((c) => c.level === 'error'))

async function doExport() {
  if (!store.pdfBytes || !store.plan || !store.pdfDoc || hasError.value) return
  exporting.value = true
  exported.value = false
  try {
    const bytes = await exportImposedPdf(store.pdfBytes.slice(0), store.plan, store.settings, store.pdfDoc.pages)
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (store.fileName ?? 'booklet').replace(/\.pdf$/i, '') + '-拼版.pdf'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    exported.value = true
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <section class="panel">
    <h3>导出前检查</h3>
    <ul class="checks">
      <li v-for="(c, i) in checks" :key="i" :class="c.level">
        <span class="icon">{{ c.level === 'pass' ? '✓' : c.level === 'warn' ? '⚠' : '✕' }}</span>
        <span>
          <strong>{{ c.title }}</strong>
          <span class="detail">{{ c.detail }}</span>
        </span>
      </li>
    </ul>
    <button class="export" :disabled="hasError || exporting" @click="doExport">
      {{ exporting ? '正在生成…' : '导出拼版 PDF' }}
    </button>
    <p v-if="exported" class="ok">
      已导出。下载文件中的页序、补白与旋转方向与上方预览一致（导出为矢量嵌入，非预览位图）。
    </p>
  </section>
</template>

<style scoped>
.panel { border: 1px solid #ddd; border-radius: 6px; padding: 12px 14px; }
h3 { font-size: 15px; margin: 0 0 10px; }
.checks { list-style: none; margin: 0 0 12px; padding: 0; }
.checks li { display: flex; gap: 8px; font-size: 13px; margin-bottom: 6px; align-items: baseline; }
.icon { font-weight: bold; }
.pass .icon { color: #2e8b57; }
.warn .icon { color: #d89a00; }
.error .icon { color: #c0392b; }
.detail { display: block; color: #666; font-size: 12px; }
.export { padding: 7px 20px; background: #2456b8; color: #fff; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
.export:disabled { background: #9db4dd; cursor: default; }
.ok { color: #2e8b57; font-size: 12px; margin: 8px 0 0; }
</style>
