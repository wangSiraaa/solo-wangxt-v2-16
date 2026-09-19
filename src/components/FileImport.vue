<script setup lang="ts">
import { useProjectStore } from '../store/project'

const store = useProjectStore()

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) store.loadFile(file)
  input.value = ''
}
</script>

<template>
  <section class="panel">
    <h3>导入 PDF</h3>
    <div class="row">
      <label class="file-btn">
        选择 PDF 文件
        <input type="file" accept="application/pdf,.pdf" @change="onFileChange" hidden />
      </label>
      <button @click="store.loadSample(8)">载入 8 页样册</button>
      <button @click="store.loadSample(11)">载入 11 页样册</button>
    </div>
    <p v-if="store.fileName" class="file-name">
      当前文件：{{ store.fileName }}（{{ store.pageCount }} 页）
    </p>
    <p v-if="store.error" class="error">{{ store.error }}</p>
    <p class="note">所有处理均在浏览器本地完成，文件不会上传。</p>
  </section>
</template>

<style scoped>
.panel { border: 1px solid #ddd; border-radius: 6px; padding: 12px 14px; }
h3 { font-size: 15px; margin: 0 0 10px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.file-btn, button {
  padding: 5px 14px; border: 1px solid #bbb; background: #fff; border-radius: 4px;
  cursor: pointer; font-size: 13px; display: inline-block;
}
.file-btn:hover, button:hover { background: #f0f4ff; }
.file-name { font-size: 13px; color: #333; margin: 8px 0 0; }
.error { color: #c0392b; font-size: 13px; margin: 8px 0 0; }
.note { font-size: 11px; color: #999; margin: 8px 0 0; }
</style>
