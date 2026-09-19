/**
 * 核心拼版模型 —— 纯函数，预览与导出共用同一页序/旋转计算，
 * 保证“所见即所得”。
 *
 * 物理约定（见 scratch/fold-true.mjs 的数值折叠验证）：
 * 输出为横向大纸（成品宽 = 2 × 页宽，高 = 页高），竖直书脊。
 * 每张输出纸两面板（左右半张），双面打印后右半张向后折叠成书帖。
 *
 * 面板到物理页（逻辑序，从 1 开始）的对应（面板名 half 是同物理半张配对）：
 *   LA (正面-L) = N-2k   RA (正面-R) = 1+2k
 *   LB (背面-L) = N-1-2k RB (背面-R) = 2+2k     (k=0 为最外帖)
 * 实际打印到纸上时，背面翻纸导致左右镜像（见 physicalHalf()）：
 *   正面高码页在纸左、封面在纸右；背面偶页码（左页）在纸左、奇页码（右页）在纸右。
 *
 * 两种双面翻转（设备翻纸轴决定背面 PDF 坐标系）：
 *   short（短边翻转，绕竖直轴）：四象限旋转角均为 0
 *   long （长边翻转，绕水平轴）：LB / RB 旋转 180°
 */

export type FlipMode = 'short' | 'long';
export type SheetSide = 'front' | 'back';
export type PanelKey = 'LA' | 'RA' | 'LB' | 'RB';

/** 单个内容页（可能是真实页或补白页） */
export interface ContentPage {
  /** 在“逻辑册子”中的序号，1 起；补白页也有自己的位置序号 */
  position: number;
  /** 来源原 PDF 页码（1 起）；补白或被排除页为 null */
  sourcePage: number | null;
  kind: 'content' | 'blank' | 'excluded';
}

export interface PlacedPanel {
  key: PanelKey;
  side: SheetSide;
  /** 该面版在输出纸上的左半/右半 */
  half: 'L' | 'R';
  /** 放置的逻辑页（position 从 1 起）；null 表示该面版无对应（理论上不会发生） */
  position: number;
  page: ContentPage;
  /** 在输出纸坐标系中该页需要的旋转角（度，pdf 语义：仅 0 / 180） */
  rotationDeg: 0 | 180;
}

export interface ImposedSheet {
  /** 0 = 最外帖（封面帖，单独计纸） */
  index: number;
  front: PlacedPanel[];
  back: PlacedPanel[];
}

export interface ImpositionResult {
  /** 逻辑总页数（4 的倍数） */
  totalPositions: number;
  /** 内容/补白逻辑页序列（1 起索引，数组下标 0 = 位置 1） */
  pages: ContentPage[];
  sheets: ImposedSheet[];
  sheetCount: number;
  /** 被补白填充的位置（1 起） */
  blankPositions: number[];
  /** 被排除的原页码（1 起，升序） */
  excludedSourcePages: number[];
  contentPageCount: number;
  flip: FlipMode;
}

/**
 * 构造逻辑页序列。
 * @param originalPageCount 原 PDF 页数
 * @param excluded 被排除的原页码集合（1 起）
 */
export function buildPages(
  originalPageCount: number,
  excluded: ReadonlySet<number>,
): { pages: ContentPage[]; excludedSourcePages: number[] } {
  const pages: ContentPage[] = [];
  const excludedSourcePages: number[] = [];
  let position = 1;
  for (let src = 1; src <= originalPageCount; src++) {
    if (excluded.has(src)) {
      excludedSourcePages.push(src);
      // 排除页：保留占位但标记 excluded，导出与预览均不绘制内容
      pages.push({ position: position++, sourcePage: null, kind: 'excluded' });
    } else {
      pages.push({ position: position++, sourcePage: src, kind: 'content' });
    }
  }
  return { pages, excludedSourcePages };
}

/**
 * 追加补白使总页数为 4 的倍数。
 * 补白位置是“检查骑马订页序”的关键信息：补白出现在封面/封底或书心前后，
 * 必须显式展示给工作人员。
 */
export function padPages(pages: ContentPage[]): {
  pages: ContentPage[];
  paddedTo: number;
  blankPositions: number[];
} {
  const out = pages.slice();
  const blankPositions: number[] = [];
  while (out.length % 4 !== 0) {
    const position = out.length + 1;
    out.push({ position, sourcePage: null, kind: 'blank' });
    blankPositions.push(position);
  }
  return { pages: out, paddedTo: out.length, blankPositions };
}

/**
 * 骑马订页序映射。返回 position -> 面板位置 的完整表。
 */
export function saddleSequence(total: number): {
  key: PanelKey;
  side: SheetSide;
  half: 'L' | 'R';
  sheet: number;
  position: number;
}[] {
  if (total % 4 !== 0) throw new Error(`总页数必须是 4 的倍数，当前 ${total}`);
  const ns = total / 4;
  const rows = [];
  for (let k = 0; k < ns; k++) {
    // half 是“面板名”（同物理半张在正反两面的配对）：
    //   front: L 放高码页、R 放低码页（封面）。
    //   back : 打印翻纸后物理半张左右镜像，用 physicalHalf() 取真实落点。
    rows.push({ key: 'LA' as PanelKey, side: 'front' as SheetSide, half: 'L' as const, sheet: k, position: total - 2 * k });
    rows.push({ key: 'RA' as PanelKey, side: 'front' as SheetSide, half: 'R' as const, sheet: k, position: 1 + 2 * k });
    rows.push({ key: 'LB' as PanelKey, side: 'back' as SheetSide, half: 'L' as const, sheet: k, position: total - 1 - 2 * k });
    rows.push({ key: 'RB' as PanelKey, side: 'back' as SheetSide, half: 'R' as const, sheet: k, position: 2 + 2 * k });
  }
  return rows.sort((a, b) =>
    a.sheet !== b.sheet
      ? a.sheet - b.sheet
      : a.side !== b.side
        ? a.side === 'front'
          ? -1
          : 1
        : a.half === 'L'
          ? -1
          : 1,
  );
}

/** 面板旋转规则（折叠数值验证结论） */
export function panelRotation(key: PanelKey, flip: FlipMode): 0 | 180 {
  if (flip === 'short') return 0;
  // long：背面两面版旋转 180°
  return key === 'LB' || key === 'RB' ? 180 : 0;
}

/**
 * 面板在“输出纸正面朝上”的 PDF 坐标中实际占据的物理半张。
 * 正面 L/R 即纸的左/右；任何双面翻转都会让背面左右镜像，故背面一律 L↔R。
 * 长/短边翻转只影响背面朝向（panelRotation），不影响物理半张。
 * 导出与预览共用本函数，保证两者半张一致。
 */
export function physicalHalf(p: { side: SheetSide; half: 'L' | 'R' }): 'L' | 'R' {
  if (p.side === 'front') return p.half;
  return p.half === 'L' ? 'R' : 'L';
}

/**
 * 生成完整拼版结果。
 */
export function impose(
  originalPageCount: number,
  excluded: ReadonlySet<number>,
  flip: FlipMode,
): ImpositionResult {
  const built = buildPages(originalPageCount, excluded);
  const padded = padPages(built.pages);
  const total = padded.paddedTo;
  const ns = total / 4;
  const sheets: ImposedSheet[] = [];
  for (let k = 0; k < ns; k++) {
    const mk = (key: PanelKey, side: SheetSide, half: 'L' | 'R', position: number): PlacedPanel => ({
      key,
      side,
      half,
      position,
      page: padded.pages[position - 1],
      rotationDeg: panelRotation(key, flip),
    });
    sheets.push({
      index: k,
      front: [
        mk('LA', 'front', 'L', total - 2 * k),
        mk('RA', 'front', 'R', 1 + 2 * k),
      ],
      back: [
        mk('LB', 'back', 'L', total - 1 - 2 * k),
        mk('RB', 'back', 'R', 2 + 2 * k),
      ],
    });
  }
  const contentPageCount = padded.pages.filter((p) => p.kind === 'content').length;
  return {
    totalPositions: total,
    pages: padded.pages,
    sheets,
    sheetCount: ns,
    blankPositions: padded.blankPositions,
    excludedSourcePages: built.excludedSourcePages,
    contentPageCount,
    flip,
  };
}

/**
 * 阅读顺序（合上书 -> 逐个跨页 -> 封底）。
 * 每项给出左页/右页的逻辑 position；用于“翻页检查”视图。
 */
export interface ReadingSpread {
  kind: 'cover' | 'opening' | 'back';
  left: number | null;
  right: number | null;
}

export function readingOrder(total: number): ReadingSpread[] {
  if (total % 4 !== 0) throw new Error(`总页数必须是 4 的倍数，当前 ${total}`);
  const ns = total / 4;
  const seq: ReadingSpread[] = [{ kind: 'cover', left: null, right: 1 }];
  // 前 ns 个跨页：右桩叶子向右翻
  for (let j = 1; j <= ns; j++) {
    const left = 2 * j; // RB, 帖 j-1
    let right: number;
    if (j < ns) right = 1 + 2 * j; // RA, 帖 j
    else right = total - 1 - 2 * (ns - 1); // 最内帖 LB
    seq.push({ kind: 'opening', left, right });
  }
  // 后 ns-1 个跨页：左桩叶子继续向右翻
  for (let t = 0; t < ns - 1; t++) {
    const k = ns - 1 - t;
    const left = total - 2 * k; // LA
    const right = total - 1 - 2 * (k - 1); // LB 帖 k-1
    seq.push({ kind: 'opening', left, right });
  }
  seq.push({ kind: 'back', left: total, right: null });
  return seq;
}
