<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useStore } from './lib/store';
import { makeSamplePdf } from './lib/sample';
import SettingsPanel from './components/SettingsPanel.vue';
import SheetView from './components/SheetView.vue';
import ReadingView from './components/ReadingView.vue';
import PageManager from './components/PageManager.vue';
import ExportPanel from './components/ExportPanel.vue';

const store = useStore();
onMounted(() => void store.init());

const tab = ref<'sheets' | 'reading'>('sheets');
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) void store.importFile(f);
}
function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void store.importFile(f);
}

async function loadSample(n: 8 | 11) {
  const bytes = await makeSamplePdf(n);
  const file = new File([bytes.slice().buffer], `样册-${n}页.pdf`, { type: 'application/pdf' });
  await store.importFile(file);
}

function thumbUrl(src: number): string | null {
  return store.thumbs.value[src - 1]?.url ?? null;
}

const sheetCount = computed(() => store.result.value?.sheetCount ?? 0);
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>骑马订小册子拼版</h1>
      <span class="sub">纯浏览器运行 · PDF.js 预览 · pdf-lib 矢量导出 · 参数存本机 IndexedDB</span>
      <span style="flex:1"></span>
      <span v-if="store.fileName.value" class="small muted">当前文件：{{ store.fileName.value }}</span>
      <button v-if="store.pdf.value" class="btn ghost" @click="store.clearDocument()">关闭文件</button>
    </header>

    <div class="app-body">
      <aside class="sidebar">
        <div class="card">
          <h2>导入 PDF</h2>
          <div
            class="dropzone"
            :class="{ drag: dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
            @click="fileInput?.click()"
          >
            <div class="big">{{ store.busy.value ? '正在解析…' : '拖入 PDF 或点击选择' }}</div>
            <div>仅在本机处理，不上传服务器</div>
          </div>
          <input ref="fileInput" type="file" accept="application/pdf" style="display:none" @change="onPick" />
          <p v-if="store.loadError.value" class="pill error mt8" style="display:block">{{ store.loadError.value }}</p>
          <div class="btn-row mt8">
            <button class="btn" @click="loadSample(8)">载入 8 页样册</button>
            <button class="btn" @click="loadSample(11)">载入 11 页样册</button>
          </div>
          <div class="hint">样册每页带大页码、顶部色条和方向箭头，便于核对折叠、补白与旋转。</div>
        </div>

        <SettingsPanel
          v-if="store.result.value"
          :settings="store.settings.value"
          :sheet-count="sheetCount"
          @update:settings="(v) => (store.settings.value = v)"
        />

        <ExportPanel
          v-if="store.result.value"
          :pdf="store.pdf.value"
          :source-bytes="store.sourceBytes.value"
          :result="store.result.value"
          :settings="store.settings.value"
          :acknowledged="store.acknowledgedPreview.value"
          @acknowledge="(v) => (store.acknowledgedPreview.value = v)"
        />
      </aside>

      <main class="main">
        <template v-if="!store.result.value">
          <div class="card">
            <h2>使用流程</h2>
            <ol class="small" style="line-height:1.9;margin:0;padding-left:20px">
              <li>导入 PDF（或一键载入 8 页 / 11 页样册）。</li>
              <li>在左侧选择纸张规格与双面翻转方式；改纸张后会重新检查出血与裁切范围。</li>
              <li>在“纸张正反面”检查每张纸的页序、补白位置、长短边背面方向。</li>
              <li>在“翻页顺序”核对 封面→跨页→封底 的阅读顺序。</li>
              <li>在原页条中排除指定页（可撤销/重做），补白位置会明确标出。</li>
              <li>阅读导出前检查并确认“预览≠最终稿”，再下载矢量拼版 PDF。</li>
            </ol>
            <div class="warning-banner mt12">
              注意：页面上的缩略图是低分辨率预览，仅用于检查，绝不进入最终 PDF；下载文件始终由原 PDF 矢量重嵌生成。
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="store.result.value.blankPositions.length" class="warning-banner">
            原页 {{ store.pdf.value?.pageCount }} 页不是 4 的倍数，已自动补白
            {{ store.result.value.blankPositions.length }} 页（位置 {{ store.result.value.blankPositions.join('、') }}）。
            补白格已在下方纸张与原页条中明确标出；封面帖单独计纸。
          </div>

          <div class="tabs">
            <button :class="{ active: tab === 'sheets' }" @click="tab = 'sheets'">纸张正反面</button>
            <button :class="{ active: tab === 'reading' }" @click="tab = 'reading'">翻页顺序</button>
          </div>

          <PageManager
            :thumbs="store.thumbs.value"
            :excluded="store.excluded.value"
            :result="store.result.value"
            :can-undo="store.history.canUndo.value"
            :can-redo="store.history.canRedo.value"
            @toggle="store.toggleExclude"
            @undo="store.undo"
            @redo="store.redo"
          />

          <SheetView
            v-if="tab === 'sheets'"
            :result="store.result.value"
            :settings="store.settings.value"
            :thumb-url="thumbUrl"
          />
          <ReadingView
            v-else
            :result="store.result.value"
            :settings="store.settings.value"
            :thumb-url="thumbUrl"
          />
        </template>
      </main>
    </div>
  </div>
</template>
