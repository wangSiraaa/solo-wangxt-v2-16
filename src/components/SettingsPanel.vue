<script setup lang="ts">
/**
 * 纸张与装订设置侧栏。改变纸张规格会触发几何（出血/裁切/安全区）重新检查。
 */
import { computed } from 'vue';
import { PAPER_PRESETS, checkGeometry, finishedPageSize, resolvePaper, type ImpositionSettings } from '../lib/paper';

const props = defineProps<{
  settings: ImpositionSettings;
  sheetCount: number;
}>()
const emit = defineEmits<{ (e: 'update:settings', v: ImpositionSettings): void }>();

function update(patch: Partial<ImpositionSettings>) {
  emit('update:settings', { ...props.settings, ...patch });
}
function updateTrim(patch: Partial<ImpositionSettings['trim']>) {
  emit('update:settings', { ...props.settings, trim: { ...props.settings.trim, ...patch } });
}

const geo = computed(() => checkGeometry(props.settings));
const paper = computed(() => resolvePaper(props.settings));
const page = computed(() => finishedPageSize(props.settings));
const isCustom = computed(() => props.settings.paperId === 'custom');

// 封面帖 1 张，内页其余（封面单独计纸时分开提示）
const coverSheets = computed(() => (props.settings.coverSeparate ? 1 : 0));
const innerSheets = computed(() => Math.max(0, props.sheetCount - coverSheets.value));

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}
</script>

<template>
  <div class="card">
    <h2>纸张与装订 <span class="tag">参数自动保存到本机</span></h2>

    <label class="field">
      <span>输出纸张规格（横向展开）</span>
      <select :value="settings.paperId" @change="update({ paperId: ($event.target as HTMLSelectElement).value })">
        <option v-for="p in PAPER_PRESETS" :key="p.id" :value="p.id">
          {{ p.name }}（{{ p.widthMm }}×{{ p.heightMm }}mm）
        </option>
      </select>
    </label>

    <div v-if="isCustom" class="row2">
      <label class="field"><span>纸宽 mm</span>
        <input type="number" :value="settings.customWidthMm" min="100" step="1"
          @input="update({ customWidthMm: +($event.target as HTMLInputElement).value })" />
      </label>
      <label class="field"><span>纸高 mm</span>
        <input type="number" :value="settings.customHeightMm" min="80" step="1"
          @input="update({ customHeightMm: +($event.target as HTMLInputElement).value })" />
      </label>
    </div>

    <div class="kv"><span>展开纸</span><b>{{ paper.widthMm }} × {{ paper.heightMm }} mm</b></div>
    <div class="kv"><span>成品页（半张）</span><b>{{ fmt(page.widthMm) }} × {{ fmt(page.heightMm) }} mm</b></div>

    <label class="field mt8">
      <span>双面翻转方式</span>
      <div class="seg">
        <button :class="{ active: settings.flip === 'short' }" @click="update({ flip: 'short' })">短边翻转</button>
        <button :class="{ active: settings.flip === 'long' }" @click="update({ flip: 'long' })">长边翻转</button>
      </div>
    </label>
    <div class="hint">
      {{ settings.flip === 'short'
        ? '绕竖直短边翻纸：背面方向不变（左右页镜像由双面打印天然形成）。'
        : '绕水平长边翻纸：背面两页需整体旋转 180°，预览中可明显看到背面倒置。' }}
    </div>

    <h2 class="mt12">出血 / 裁切 / 安全区</h2>
    <div class="row2">
      <label class="field"><span>出血 mm</span>
        <input type="number" :value="settings.trim.bleedMm" min="0" step="0.5"
          @input="updateTrim({ bleedMm: +($event.target as HTMLInputElement).value })" /></label>
      <label class="field"><span>裁切边距 mm</span>
        <input type="number" :value="settings.trim.trimMarginMm" min="0" step="0.5"
          @input="updateTrim({ trimMarginMm: +($event.target as HTMLInputElement).value })" /></label>
    </div>
    <div class="row2">
      <label class="field"><span>安全区 mm</span>
        <input type="number" :value="settings.trim.safetyMm" min="0" step="0.5"
          @input="updateTrim({ safetyMm: +($event.target as HTMLInputElement).value })" /></label>
      <label class="field"><span>爬移补偿 mm</span>
        <input type="number" :value="settings.trim.creepMm" min="0" step="0.1"
          @input="updateTrim({ creepMm: +($event.target as HTMLInputElement).value })" /></label>
    </div>
    <label class="checkline">
      <input type="checkbox" :checked="settings.trim.drawMarks"
        @change="updateTrim({ drawMarks: ($event.target as HTMLInputElement).checked })" />
      绘制裁切/出血标记与安全框
    </label>

    <h2 class="mt12">封面计纸</h2>
    <label class="checkline">
      <input type="checkbox" :checked="settings.coverSeparate"
        @change="update({ coverSeparate: ($event.target as HTMLInputElement).checked })" />
      封面帖单独计纸
    </label>
    <div class="kv"><span>封面纸</span><b>{{ coverSheets }} 张</b></div>
    <div class="kv"><span>内页纸</span><b>{{ innerSheets }} 张</b></div>
    <div class="kv"><span>合计用纸</span><b>{{ sheetCount }} 张</b></div>

    <div v-if="geo.length" class="mt12">
      <div v-for="g in geo" :key="g.code" class="preflight-item" :class="g.level">
        <span class="dot"></span><span>{{ g.message }}</span>
      </div>
    </div>
  </div>
</template>
