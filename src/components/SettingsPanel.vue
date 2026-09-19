<script setup lang="ts">
import { useProjectStore } from '../store/project'
import { PAPER_PRESETS } from '../types'

const store = useProjectStore()
</script>

<template>
  <section class="panel">
    <h3>纸张与装订设置</h3>

    <label class="row">
      <span>正文纸张</span>
      <select
        :value="store.settings.paperId"
        @change="store.updateSettings({ paperId: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="p in PAPER_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </label>

    <label class="row">
      <span>双面翻转</span>
      <span class="radios">
        <label>
          <input
            type="radio"
            name="flip"
            value="long-edge"
            :checked="store.settings.duplexFlip === 'long-edge'"
            @change="store.updateSettings({ duplexFlip: 'long-edge' })"
          />
          长边翻转（背面正立）
        </label>
        <label>
          <input
            type="radio"
            name="flip"
            value="short-edge"
            :checked="store.settings.duplexFlip === 'short-edge'"
            @change="store.updateSettings({ duplexFlip: 'short-edge' })"
          />
          短边翻转（背面倒置）
        </label>
      </span>
    </label>

    <label class="row">
      <span>出血</span>
      <span>
        <input
          type="number"
          min="0"
          max="10"
          step="0.5"
          :value="store.settings.bleed"
          @change="store.updateSettings({ bleed: Number(($event.target as HTMLInputElement).value) })"
          class="num"
        />
        mm
      </span>
    </label>

    <label class="row">
      <span>封面</span>
      <label>
        <input
          type="checkbox"
          :checked="store.settings.separateCover"
          @change="store.updateSettings({ separateCover: ($event.target as HTMLInputElement).checked })"
        />
        封面单独计纸（封面/封底独立一张纸）
      </label>
    </label>

    <label v-if="store.settings.separateCover" class="row">
      <span>封面纸张</span>
      <select
        :value="store.settings.coverPaperId"
        @change="store.updateSettings({ coverPaperId: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="p in PAPER_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </label>

    <div class="row actions">
      <button :disabled="!store.canUndo" @click="store.undo()">撤销调整</button>
      <button @click="store.reset()">清空工程</button>
    </div>
    <p class="note">参数与文件自动保存在浏览器 IndexedDB，刷新后可继续。</p>
  </section>
</template>

<style scoped>
.panel { border: 1px solid #ddd; border-radius: 6px; padding: 12px 14px; }
h3 { font-size: 15px; margin: 0 0 10px; }
.row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; font-size: 13px; }
.row > span:first-child { width: 64px; color: #555; flex-shrink: 0; }
.radios { display: flex; flex-direction: column; gap: 4px; }
.num { width: 60px; }
.actions { gap: 8px; }
button { padding: 4px 12px; border: 1px solid #bbb; background: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; }
button:disabled { opacity: 0.4; cursor: default; }
.note { font-size: 11px; color: #999; margin: 4px 0 0; }
select, input[type='number'] { font-size: 13px; padding: 2px 4px; }
</style>
