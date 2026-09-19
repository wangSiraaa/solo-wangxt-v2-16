<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useProjectStore } from '../store/project'
import { paperById, sheetSize } from '../pdf/exporter'
import type { SheetSide } from '../types'

const store = useProjectStore()

/** 页面缩略图缓存：页码 → canvas（低分辨率，仅供屏幕预览） */
const thumbCache = new Map<number, HTMLCanvasElement>()
const rendering = ref(false)

async function ensureThumbs() {
  const doc = store.pdfDoc
  if (!doc) return
  rendering.value = true
  try {
    for (const p of doc.pages) {
      if (!thumbCache.has(p.pageNumber)) {
        thumbCache.set(p.pageNumber, await doc.renderPage(p.pageNumber, 220))
      }
    }
  } finally {
    rendering.value = false
    await drawAll()
  }
}

const canvasRefs = new Map<string, HTMLCanvasElement>()
function setCanvasRef(key: string, el: unknown) {
  if (el) canvasRefs.set(key, el as HTMLCanvasElement)
  else canvasRefs.delete(key)
}

const SCALE = 2.2 // px per mm，屏幕预览

async function drawSide(canvas: HTMLCanvasElement, side: SheetSide, cover: boolean) {
  const paper = cover && store.settings.separateCover ? paperById(store.settings.coverPaperId) : paperById(store.settings.paperId)
  const size = sheetSize(paper)
  const slotW = size.width / 2
  const ctx = canvas.getContext('2d')!
  canvas.width = Math.round(size.width * SCALE)
  canvas.height = Math.round(size.height * SCALE)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#999'
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)

  const drawSlot = (page: number | null, x0mm: number) => {
    const x = x0mm * SCALE
    const w = slotW * SCALE
    const h = size.height * SCALE
    if (page === null) {
      // 补白位置明确标出
      ctx.fillStyle = '#f4f4f4'
      ctx.fillRect(x, 0, w, h)
      ctx.strokeStyle = '#bbb'
      ctx.setLineDash([5, 4])
      ctx.strokeRect(x + 4, 4, w - 8, h - 8)
      ctx.setLineDash([])
      ctx.fillStyle = '#999'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('补白', x + w / 2, h / 2)
      return
    }
    const info = store.pdfDoc!.pages[page - 1]
    const thumb = thumbCache.get(page)
    if (!info || !thumb) return
    const pw = info.widthMm * SCALE
    const ph = info.heightMm * SCALE
    ctx.save()
    if (side.rotated) {
      // 短边翻转：背面倒置
      ctx.translate(x + w / 2, h / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-pw / 2, -ph / 2)
    } else {
      ctx.translate(x + (w - pw) / 2, (h - ph) / 2)
    }
    ctx.drawImage(thumb, 0, 0, pw, ph)
    ctx.strokeStyle = '#ddd'
    ctx.strokeRect(0, 0, pw, ph)
    ctx.restore()
    // 页码角标
    ctx.fillStyle = 'rgba(30,80,200,0.85)'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`P${page}`, x + 5, 15)
  }
  drawSlot(side.left.page, 0)
  drawSlot(side.right.page, slotW)

  // 折线
  ctx.strokeStyle = '#e07070'
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(slotW * SCALE, 0)
  ctx.lineTo(slotW * SCALE, canvas.height)
  ctx.stroke()
  ctx.setLineDash([])

  if (side.rotated) {
    ctx.fillStyle = '#b04040'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('短边翻转 · 背面倒置 180°', canvas.width - 6, canvas.height - 6)
  }
}

async function drawAll() {
  const plan = store.plan
  if (!plan) return
  for (const sheet of plan.sheets) {
    for (const [sideName, side] of [['front', sheet.front], ['back', sheet.back]] as const) {
      const canvas = canvasRefs.get(`${sheet.index}-${sideName}`)
      if (canvas) await drawSide(canvas, side, sheet.cover)
    }
  }
}

watch(
  () => [store.pdfDoc, store.plan, store.settings.paperId, store.settings.coverPaperId, store.settings.duplexFlip],
  () => ensureThumbs(),
  { immediate: true, deep: true, flush: 'post' },
)

onBeforeUnmount(() => thumbCache.clear())

const flipLabel = computed(() => (store.settings.duplexFlip === 'long-edge' ? '长边翻转' : '短边翻转'))
</script>

<template>
  <section v-if="store.plan" class="sheet-view">
    <h3>
      纸张正反面视图
      <span class="hint">
        共 {{ store.plan.sheets.length }} 张纸（正文 {{ store.plan.bodySheetCount }} 张<template v-if="store.plan.coverSheetCount">＋封面 {{ store.plan.coverSheetCount }} 张</template>）·
        双面打印方式：{{ flipLabel }} · 预览为低分辨率位图，导出 PDF 为矢量
      </span>
    </h3>
    <div v-for="sheet in store.plan.sheets" :key="sheet.index" class="sheet">
      <div class="sheet-title">
        第 {{ sheet.index + 1 }} 张纸
        <span v-if="sheet.cover" class="badge cover">封面纸（{{ store.settings.coverPaperId }}）</span>
        <span v-else class="badge">正文纸（{{ store.settings.paperId }}）</span>
      </div>
      <div class="sides">
        <figure v-for="sideName in (['front', 'back'] as const)" :key="sideName">
          <canvas :ref="(el) => setCanvasRef(`${sheet.index}-${sideName}`, el)"></canvas>
          <figcaption>
            {{ sideName === 'front' ? '正面' : '背面' }}
            <template v-if="sideName === 'back' && sheet.back.rotated">（倒置）</template>
            · 左 P{{ sheet[sideName].left.page ?? '白' }} / 右 P{{ sheet[sideName].right.page ?? '白' }}
          </figcaption>
        </figure>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sheet-view h3 { font-size: 15px; margin: 18px 0 8px; }
.hint { font-weight: normal; font-size: 12px; color: #777; margin-left: 8px; }
.sheet { margin-bottom: 14px; }
.sheet-title { font-size: 13px; margin-bottom: 4px; }
.badge { background: #e8eefc; color: #2456b8; border-radius: 3px; padding: 1px 6px; font-size: 11px; margin-left: 6px; }
.badge.cover { background: #fdeecf; color: #8a5a00; }
.sides { display: flex; gap: 12px; flex-wrap: wrap; }
figure { margin: 0; }
canvas { display: block; max-width: 100%; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.18); }
figcaption { font-size: 12px; color: #555; margin-top: 3px; text-align: center; }
</style>
