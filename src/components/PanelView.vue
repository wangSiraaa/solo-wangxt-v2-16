<script setup lang="ts">
/**
 * 单页面板预览：把低分辨率原页位图放进半张面板，按 rotationDeg 旋转。
 * 物理半张由父级用 physicalHalf 决定后传入 slot（L/R），与导出共用同一规则。
 * 明确：这里显示的是低分辨率位图，仅用于检查，不会进入导出 PDF。
 */
import { computed } from 'vue';
import type { PlacedPanel } from '../lib/imposition';

const props = defineProps<{
  panel: PlacedPanel;
  thumbUrl: string | null;
  slotHalf: 'L' | 'R';
}>();

const kind = computed(() => props.panel.page.kind);
const label = computed(() => {
  const p = props.panel.page;
  if (p.kind === 'blank') return `补白 · 位置 ${p.position}`;
  if (p.kind === 'excluded') return `已排除 · 位置 ${p.position}`;
  return `位置 ${p.position}`;
});
const srcLabel = computed(() =>
  props.panel.page.sourcePage !== null ? `原页 ${props.panel.page.sourcePage}` : '',
);
</script>

<template>
  <div class="half" :data-half="slotHalf">
    <span class="side-tag">{{ slotHalf === 'L' ? '纸左' : '纸右' }} · {{ panel.key }}</span>
    <span v-if="panel.rotationDeg" class="rot-badge">旋转 {{ panel.rotationDeg }}°</span>
    <div class="panel-canvas">
      <template v-if="kind === 'content'">
        <img
          v-if="thumbUrl"
          :src="thumbUrl"
          :style="{ transform: `rotate(${panel.rotationDeg}deg)` }"
          alt=""
        />
        <div v-else class="cell-num">渲染中…</div>
      </template>
      <div :class="kind === 'blank' ? 'blank-cell' : 'excluded-cell'">
        <span class="cell-num">{{ label }}</span>
        <span v-if="srcLabel" class="cell-src">{{ srcLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.half { position: relative; flex: 1; min-width: 0; display: flex; }
.half + .half { border-left: 1px dashed #c9d1dd; }
.panel-canvas { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.panel-canvas img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform .2s;
}
</style>
