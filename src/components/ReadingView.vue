<script setup lang="ts">
/**
 * 翻页检查：按读者实际翻页顺序展示 封面 → 跨页(L|R) → 封底。
 * 每个跨页标注左/右逻辑页、源页码或补白/排除，并显示该页在 PDF 里的旋转，
 * 方便工作人员核对骑马订页序与翻页后朝向。
 */
import { computed } from 'vue';
import { readingOrder } from '../lib/imposition';
import type { ImpositionResult, PlacedPanel } from '../lib/imposition';
import { finishedPageSize } from '../lib/paper';
import type { ImpositionSettings } from '../lib/paper';

const props = defineProps<{
  result: ImpositionResult;
  settings: ImpositionSettings;
  thumbUrl: (sourcePage: number) => string | null;
}>();

const seq = computed(() => readingOrder(props.result.totalPositions));
const pageMap = computed(() => new Map(props.result.pages.map((p) => [p.position, p])));

// position -> 面板（含旋转与所在纸/面）
const panelMap = computed(() => {
  const m = new Map<number, PlacedPanel & { sheetIndex: number }>();
  for (const s of props.result.sheets) {
    for (const p of [...s.front, ...s.back]) m.set(p.position, { ...p, sheetIndex: s.index });
  }
  return m;
});

const PAGE_PX_W = 250;
const pageH = computed(() => {
  const fp = finishedPageSize(props.settings);
  return Math.round(PAGE_PX_W * fp.heightMm / fp.widthMm);
});

function rotOf(pos: number | null) {
  if (pos === null) return 0;
  return panelMap.value.get(pos)?.rotationDeg ?? 0;
}

interface Cell {
  pos: number;
  kind: string;
  src: number | null;
  url: string;
  rot: number;
}
function cell(pos: number | null): Cell | null {
  if (pos === null) return null;
  const pg = pageMap.value.get(pos);
  const src = pg?.sourcePage ?? null;
  return {
    pos,
    kind: pg?.kind ?? 'content',
    src,
    url: src !== null ? props.thumbUrl(src) ?? '' : '',
    rot: rotOf(pos),
  };
}
</script>

<template>
  <div>
    <div class="hint mb8">
      按真实翻页顺序排列。旋转角为该页在输出 PDF 中的朝向（长边翻转时书心背面页为 180°，设备翻纸后转正）。
    </div>
    <div v-for="(sp, i) in seq" :key="i" class="reading-spread">
      <div class="sheet-label">
        <template v-if="sp.kind === 'cover'">合上 · 封面</template>
        <template v-else-if="sp.kind === 'back'">封底（翻到最后）</template>
        <template v-else>跨页 {{ i }}</template>
      </div>
      <div class="spread" :style="{ width: (sp.kind === 'opening' ? PAGE_PX_W * 2 : PAGE_PX_W) + 'px', height: pageH + 'px' }">
        <template v-for="side in ['left', 'right'] as const" :key="side">
          <div
            v-if="cell(sp[side])"
            class="page"
            :class="{ 'is-blank': cell(sp[side])!.kind === 'blank', 'is-excluded': cell(sp[side])!.kind === 'excluded' }"
            :style="{ width: PAGE_PX_W + 'px' }"
          >
            <span class="corner">
              {{ side === 'left' ? '左' : '右' }} · 位置{{ cell(sp[side])!.pos }} ·
              {{ cell(sp[side])!.src !== null ? '原页' + cell(sp[side])!.src : cell(sp[side])!.kind }}
              <template v-if="cell(sp[side])!.rot"> · {{ cell(sp[side])!.rot }}°</template>
            </span>
            <img
              v-if="cell(sp[side])!.url"
              :src="cell(sp[side])!.url"
              :style="{ transform: `rotate(${cell(sp[side])!.rot}deg)` }"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { position: relative; height: 100%; display: flex; align-items: center; justify-content: center; background: #fff; }
.page img { max-width: 100%; max-height: 100%; object-fit: contain; }
.page.is-blank { background: repeating-linear-gradient(45deg,#f4f5f7,#f4f5f7 10px,#eceef2 10px,#eceef2 20px); }
.page.is-excluded { background: repeating-linear-gradient(45deg,#faf0f0,#faf0f0 10px,#f5e3e3 10px,#f5e3e3 20px); }
.corner { position: absolute; top: 6px; left: 8px; z-index: 2; font-size: 10.5px; color: #556; background: rgba(255,255,255,.82); padding: 1px 7px; border-radius: 5px; }
</style>
