<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useProjectStore } from '../store/project'

const store = useProjectStore()
const thumbs = ref<Map<number, string>>(new Map())
let generation = 0

watch(
  () => store.pdfDoc,
  async (doc) => {
    const gen = ++generation
    thumbs.value = new Map()
    if (!doc) return
    const map = new Map<number, string>()
    for (const p of doc.pages) {
      if (gen !== generation) return
      const canvas = await doc.renderPage(p.pageNumber, 120)
      map.set(p.pageNumber, canvas.toDataURL('image/png'))
      thumbs.value = new Map(map)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => generation++)
</script>

<template>
  <section v-if="store.pdfDoc" class="panel">
    <h3>
      原始页面（{{ store.pageCount }} 页）
      <span class="hint">点击页面可排除/恢复；被排除的页不参与拼版</span>
    </h3>
    <div class="grid">
      <div
        v-for="p in store.pageCount"
        :key="p"
        class="cell"
        :class="{ excluded: store.excludedPages.has(p) }"
        @click="store.toggleExclude(p)"
      >
        <img v-if="thumbs.get(p)" :src="thumbs.get(p)" :alt="`第 ${p} 页`" />
        <div v-else class="placeholder">…</div>
        <div class="label">
          第 {{ p }} 页
          <span v-if="store.excludedPages.has(p)" class="tag">已排除</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel { border: 1px solid #ddd; border-radius: 6px; padding: 12px 14px; }
h3 { font-size: 15px; margin: 0 0 10px; }
.hint { font-weight: normal; font-size: 12px; color: #777; margin-left: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 10px; }
.cell { cursor: pointer; border: 2px solid transparent; border-radius: 4px; padding: 3px; text-align: center; }
.cell:hover { border-color: #9ab6f0; }
.cell.excluded { opacity: 0.45; border-color: #d9534f; }
.cell img { width: 100%; display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.placeholder { aspect-ratio: 0.7; background: #f0f0f0; }
.label { font-size: 11px; color: #555; margin-top: 2px; }
.tag { color: #d9534f; }
</style>
