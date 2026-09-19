<script setup lang="ts">
/**
 * 原页缩略图条：点击切换“排除/纳入”，带撤销/重做。
 * 补白页不属于原 PDF，单独在末尾用占位格提示。
 */
import type { ImpositionResult } from '../lib/imposition';
import type { Thumb } from '../lib/store';

defineProps<{
  thumbs: Thumb[];
  excluded: Set<number>;
  result: ImpositionResult;
  canUndo: boolean;
  canRedo: boolean;
}>();
const emit = defineEmits<{
  (e: 'toggle', page: number): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
}>();
</script>

<template>
  <div class="card">
    <div class="flex-between mb8">
      <h2 style="margin:0">原页管理 · 点击缩略图排除/恢复</h2>
      <div class="btn-row">
        <button class="btn" :disabled="!canUndo" @click="emit('undo')">撤销调整</button>
        <button class="btn" :disabled="!canRedo" @click="emit('redo')">重做</button>
      </div>
    </div>

    <div class="page-strip">
      <div
        v-for="t in thumbs"
        :key="t.page"
        class="thumb"
        :class="{ excluded: excluded.has(t.page) }"
        :title="excluded.has(t.page) ? `原页 ${t.page} 已排除，点击恢复` : `点击排除原页 ${t.page}`"
        @click="emit('toggle', t.page)"
      >
        <img v-if="t.url" :src="t.url" alt="" style="width:100%;display:block" />
        <div v-else style="aspect-ratio:0.707;display:flex;align-items:center;justify-content:center;color:#9aa3b2;font-size:11px">
          {{ t.loading ? '渲染中…' : '原页 ' + t.page }}
        </div>
        <span v-if="excluded.has(t.page)" class="ex-flag">已排除</span>
        <span class="n">原页 {{ t.page }}</span>
      </div>

      <!-- 补白占位（仅在末尾出现） -->
      <template v-for="pos in result.blankPositions" :key="'b' + pos">
        <div class="thumb" style="border-style:dashed;cursor:default;background:#f4f5f7">
          <div style="aspect-ratio:0.707;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--blank)">
            <span class="blank-flag" style="position:static">补白</span>
            <span style="font-size:11px">位置 {{ pos }}</span>
          </div>
          <span class="n">自动补白</span>
        </div>
      </template>
    </div>

    <div class="hint mt8">
      共 {{ thumbs.length }} 个原页，已排除 {{ excluded.size }} 页；
      拼版逻辑页 {{ result.totalPositions }}（补白 {{ result.blankPositions.length }} 页），
      用纸 {{ result.sheetCount }} 张。
    </div>
  </div>
</template>
