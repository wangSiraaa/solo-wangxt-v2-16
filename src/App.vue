<script setup lang="ts">
import { onMounted } from 'vue'
import { useProjectStore } from './store/project'
import FileImport from './components/FileImport.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import PageGrid from './components/PageGrid.vue'
import SheetView from './components/SheetView.vue'
import ExportPanel from './components/ExportPanel.vue'

const store = useProjectStore()
onMounted(() => store.restore())
</script>

<template>
  <div class="app">
    <header>
      <h1>小册子拼版工具 · 骑马订</h1>
      <p>纯浏览器运行 · PDF.js 渲染预览 · pdf-lib 矢量导出 · 参数保存在 IndexedDB</p>
    </header>
    <main>
      <div class="left">
        <FileImport />
        <SettingsPanel />
        <ExportPanel />
      </div>
      <div class="right">
        <p v-if="store.loading" class="status">正在解析 PDF…</p>
        <PageGrid />
        <SheetView />
      </div>
    </main>
  </div>
</template>

<style>
body { font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif; margin: 0; background: #f7f8fa; color: #222; }
.app { max-width: 1280px; margin: 0 auto; padding: 16px 20px 40px; }
header h1 { font-size: 20px; margin: 8px 0 2px; }
header p { font-size: 12px; color: #888; margin: 0 0 16px; }
main { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
.left { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 12px; }
.right { min-width: 0; }
.status { font-size: 13px; color: #2456b8; }
@media (max-width: 900px) {
  main { grid-template-columns: 1fr; }
  .left { position: static; }
}
</style>
