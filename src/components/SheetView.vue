<script setup lang="ts">
/**
 * 纸张正反面：每张输出纸渲染两行——“正面（A）”与“背面（B，翻纸后所见）”。
 * 背面的物理半张与朝向严格按导出规则呈现：
 *   - 背面左右镜像（偶页码在纸左）；
 *   - 长边翻转背面整体旋转 180°，短边不转。
 * 尺寸按纸张实际宽高比缩放。
 */
import { computed } from 'vue';
import type { ImpositionResult } from '../lib/imposition';
import { physicalHalf } from '../lib/imposition';
import { finishedPageSize, MM_TO_PT } from '../lib/paper';
import type { ImpositionSettings } from '../lib/paper';
import PanelView from './PanelView.vue';

const props = defineProps<{
  result: ImpositionResult;
  settings: ImpositionSettings;
  thumbUrl: (sourcePage: number) => string | null;
}>();

// 每张纸（横向）显示宽度 px；高度按展开纸宽高比
const SHEET_PX_W = 760;
const ratio = computed(() => {
  const fp = finishedPageSize(props.settings);
  // 展开纸 = 2*页宽 × 页高
  return fp.heightMm / (2 * fp.widthMm);
});
const sheetH = computed(() => Math.round(SHEET_PX_W * ratio.value));

// 面板按物理半张排到左/右槽位
function arrange(panels: ImpositionResult['sheets'][number]['front']) {
  const left = panels.find((p) => physicalHalf(p) === 'L')!;
  const right = panels.find((p) => physicalHalf(p) === 'R')!;
  return { left, right };
}

// 长边背面整面在预览中用一个外层翻转容器表达“设备翻纸”，
// 但真正决定内容朝向的是每个面板的 rotationDeg（与 PDF 一致），这里不再叠加。
const flipName = computed(() => (props.result.flip === 'short' ? '短边翻转（绕竖直轴）' : '长边翻转（绕水平轴）'));
void MM_TO_PT;
</script>

<template>
  <div>
    <div class="legend">
      <span><i style="background:#fff;border:1px solid #b9c1cf"></i>内容原页（低分辨率预览）</span>
      <span><i style="background:#eef0f3"></i>补白页</span>
      <span><i style="background:#f3dada"></i>已排除页</span>
      <span>双面方式：<b>{{ flipName }}</b></span>
    </div>

    <div v-for="sheet in result.sheets" :key="sheet.index" class="sheet-wrap">
      <div class="sheet-label">
        第 {{ sheet.index + 1 }} 张 / 共 {{ result.sheetCount }} 张
        <span v-if="sheet.index === 0" class="pill blank">封面帖（单独计纸）</span>
      </div>

      <!-- 正面 -->
      <div class="sheet side-front" :style="{ width: SHEET_PX_W + 'px', height: sheetH + 'px' }">
        <PanelView
          :panel="arrange(sheet.front).left" :slot-half="'L'"
          :thumb-url="arrange(sheet.front).left.page.sourcePage ? thumbUrl(arrange(sheet.front).left.page.sourcePage!) : null"
        />
        <PanelView
          :panel="arrange(sheet.front).right" :slot-half="'R'"
          :thumb-url="arrange(sheet.front).right.page.sourcePage ? thumbUrl(arrange(sheet.front).right.page.sourcePage!) : null"
        />
      </div>
      <div class="sheet-label">↑ 正面（A）打印面</div>

      <!-- 背面 -->
      <div class="sheet side-back" :style="{ width: SHEET_PX_W + 'px', height: sheetH + 'px' }">
        <PanelView
          :panel="arrange(sheet.back).left" :slot-half="'L'"
          :thumb-url="arrange(sheet.back).left.page.sourcePage ? thumbUrl(arrange(sheet.back).left.page.sourcePage!) : null"
        />
        <PanelView
          :panel="arrange(sheet.back).right" :slot-half="'R'"
          :thumb-url="arrange(sheet.back).right.page.sourcePage ? thumbUrl(arrange(sheet.back).right.page.sourcePage!) : null"
        />
      </div>
      <div class="sheet-label">↓ 背面（B）翻纸后所见 · {{ result.flip === 'long' ? '内容旋转 180°' : '内容方向不变' }}</div>
    </div>
  </div>
</template>
