/**
 * 纸张与装订设置。
 * 输出纸始终横向（成品页宽 = 纸宽/2）。出血、裁切参数单位统一为毫米，
 * 在导出/预览时换算成 PDF pt（1mm = 2.834645669pt）。
 */

export const MM_TO_PT = 2.834645669;

export interface PaperPreset {
  id: string;
  name: string;
  /** 输出大纸（横向）尺寸，毫米 */
  widthMm: number;
  heightMm: number;
  /** 该纸适用的常规定量 g/m²，仅作信息展示 */
  gsm?: number;
}

/**
 * 纸张尺寸指“拼版后的大纸”，即两个成品页宽 + 书脊。
 * 预设给出常用成品开本对应的展开尺寸。
 */
export const PAPER_PRESETS: PaperPreset[] = [
  { id: 'a3', name: 'A3 横向（A4 册子）', widthMm: 420, heightMm: 297, gsm: 128 },
  { id: 'a4', name: 'A4 横向（A5 册子）', widthMm: 297, heightMm: 210, gsm: 128 },
  { id: 'a5-sheet', name: 'A5 横向（A6 册子）', widthMm: 210, heightMm: 148, gsm: 157 },
  { id: 'b4', name: 'B4 横向（B5 册子）', widthMm: 364, heightMm: 257, gsm: 128 },
  { id: 'tabloid', name: 'Tabloid 11×17″（Letter 册子）', widthMm: 431.8, heightMm: 279.4, gsm: 105 },
  { id: 'custom', name: '自定义…', widthMm: 0, heightMm: 0 },
];

export interface TrimSpec {
  /** 出血 mm（成品外扩） */
  bleedMm: number;
  /** 裁切线与成品边距离（出血线到裁切线一般等于 bleed） */
  trimMarginMm: number;
  /** 安全区（成品内缩，重要内容应在内） */
  safetyMm: number;
  /** 爬移（creep）补偿 mm；骑马钉最内帖向外修正 */
  creepMm: number;
  /** 是否绘制裁切/出血标记 */
  drawMarks: boolean;
}

export interface ImpositionSettings {
  paperId: string;
  customWidthMm: number;
  customHeightMm: number;
  flip: 'short' | 'long';
  trim: TrimSpec;
  /** 封面单独计纸（封面帖用不同纸张） */
  coverSeparate: boolean;
  /** 封面纸（单独计纸时使用），id；null 表示同内页 */
  coverPaperId: string | null;
}

export const DEFAULT_SETTINGS: ImpositionSettings = {
  paperId: 'a3',
  customWidthMm: 420,
  customHeightMm: 297,
  flip: 'short',
  trim: {
    bleedMm: 3,
    trimMarginMm: 3,
    safetyMm: 5,
    creepMm: 0,
    drawMarks: true,
  },
  coverSeparate: false,
  coverPaperId: null,
};

export function resolvePaper(s: ImpositionSettings): { widthMm: number; heightMm: number; name: string } {
  if (s.paperId === 'custom') {
    return { widthMm: s.customWidthMm, heightMm: s.customHeightMm, name: '自定义' };
  }
  const p = PAPER_PRESETS.find((x) => x.id === s.paperId) ?? PAPER_PRESETS[0];
  return { widthMm: p.widthMm, heightMm: p.heightMm, name: p.name };
}

/** 成品页（半张）尺寸 mm */
export function finishedPageSize(s: ImpositionSettings): { widthMm: number; heightMm: number } {
  const p = resolvePaper(s);
  return { widthMm: p.widthMm / 2, heightMm: p.heightMm };
}

export interface GeometryCheck {
  level: 'ok' | 'warn' | 'error';
  code: string;
  message: string;
}

/**
 * 改变纸张规格后重新检查出血和裁切范围。
 * 规则：
 *  - 出血必须 >= 2mm（印刷常规 3mm，过小报警）
 *  - 出血不得超过成品短边的 5%（超出说明设置离谱）
 *  - 安全区必须大于出血
 *  - 爬移补偿不应超过成品页宽的 2%（过大会切内容）
 *  - 自定义纸宽必须约为偶数页宽（已天然满足，因为宽/2）且不小于 100mm
 */
export function checkGeometry(s: ImpositionSettings): GeometryCheck[] {
  const out: GeometryCheck[] = [];
  const paper = resolvePaper(s);
  const page = finishedPageSize(s);
  const t = s.trim;
  if (paper.widthMm < 100 || paper.heightMm < 80) {
    out.push({ level: 'error', code: 'paper-too-small', message: `纸张尺寸过小（${fmt(paper.widthMm)}×${fmt(paper.heightMm)}mm），无法拼版。` });
  }
  if (Math.abs(paper.widthMm / 2 - page.widthMm) > 1e-6) {
    out.push({ level: 'error', code: 'paper-width-odd', message: '纸宽必须为成品页宽的 2 倍。' });
  }
  if (t.bleedMm < 2) {
    out.push({ level: 'warn', code: 'bleed-small', message: `出血仅 ${fmt(t.bleedMm)}mm，常规要求 3mm。` });
  }
  const shortSide = Math.min(page.widthMm, page.heightMm);
  if (t.bleedMm > shortSide * 0.05) {
    out.push({ level: 'error', code: 'bleed-oversize', message: `出血 ${fmt(t.bleedMm)}mm 超过成品短边的 5%，请重新检查出血范围。` });
  }
  if (t.safetyMm <= t.bleedMm) {
    out.push({ level: 'warn', code: 'safety-lt-bleed', message: '安全区应大于出血，否则重要内容可能被裁掉。' });
  }
  if (t.creepMm > page.widthMm * 0.02) {
    out.push({ level: 'warn', code: 'creep-large', message: `爬移补偿 ${fmt(t.creepMm)}mm 过大，可能切到书心内容。` });
  }
  if (t.trimMarginMm < t.bleedMm - 0.01) {
    out.push({ level: 'warn', code: 'trim-mismatch', message: '裁切线与纸边距离小于出血值，裁切标记可能落在成品内。' });
  }
  return out;
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}
