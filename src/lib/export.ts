/**
 * 拼版导出：从“原始 PDF 字节”重新生成，绝不使用预览位图。
 * 每张纸输出两页 PDF：奇数页 = 正面，其后偶数页 = 背面。
 * 页序与旋转规则与 src/lib/imposition.ts 完全一致（预览同源）。
 *
 * 180° 旋转通过 embedPage 的变换矩阵 [-1,0,0,-1,w,h] 在嵌入时绕页面中心预置，
 * 绘制统一以 rotate=0 放置，避免 drawPage 以左下角为锚点造成的偏移。
 */
import { PDFDocument, PDFName, rgb, StandardFonts, type PDFEmbeddedPage, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ImpositionResult, PlacedPanel } from './imposition';
import { physicalHalf } from './imposition';
import { MM_TO_PT, type ImpositionSettings, resolvePaper } from './paper';

export interface ExportOptions {
  /** 原 PDF 字节；null 时生成全空白拼版 */
  sourceBytes: Uint8Array | null;
  result: ImpositionResult;
  settings: ImpositionSettings;
  /** 给补白/排除页画可见占位标记 */
  markBlanks: boolean;
  onProgress?: (done: number, total: number) => void;
}

interface Embedded {
  emb: PDFEmbeddedPage;
  width: number;
  height: number;
}

export async function buildBookletPdf(opts: ExportOptions): Promise<Uint8Array> {
  const { result, settings } = opts;
  const paper = resolvePaper(settings);
  const sheetW = paper.widthMm * MM_TO_PT;
  const sheetH = paper.heightMm * MM_TO_PT;
  const halfW = sheetW / 2;

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  // 每个内容页在拼版中恰好出现一次，其旋转（0/180）由所在面板唯一决定。
  // 只对实际用到的源页嵌入一次：需要 180° 时用预置旋转矩阵，避免重复嵌入整个页面。
  const needed = new Map<number, 0 | 180>();
  for (const s of result.sheets) {
    for (const p of [...s.front, ...s.back]) {
      if (p.page.kind === 'content' && p.page.sourcePage !== null) {
        needed.set(p.page.sourcePage, p.rotationDeg);
      }
    }
  }

  const embedded = new Map<number, Embedded>();
  if (opts.sourceBytes && opts.sourceBytes.byteLength > 0 && needed.size > 0) {
    const src = await PDFDocument.load(opts.sourceBytes);
    const srcPages = src.getPages();
    await Promise.all(
      [...needed.entries()].map(async ([srcPage1, rotation]) => {
        const sp = srcPages[srcPage1 - 1];
        if (!sp) return;
        const w = sp.getWidth();
        const h = sp.getHeight();
        const emb = await out.embedPage(
          sp,
          undefined,
          rotation === 180 ? [-1, 0, 0, -1, w, h] : undefined,
        );
        embedded.set(srcPage1, { emb, width: w, height: h });
      }),
    );
  }

  const ctx: PlaceCtx = {
    halfW,
    sheetH,
    bleed: settings.trim.bleedMm * MM_TO_PT,
    safety: settings.trim.safetyMm * MM_TO_PT,
    creepPerSheet: settings.trim.creepMm * MM_TO_PT,
    sheetCount: result.sheetCount,
    drawMarks: settings.trim.drawMarks,
    markBlanks: opts.markBlanks,
    font,
  };

  for (const sheet of result.sheets) {
    const front = out.addPage([sheetW, sheetH]);
    const back = out.addPage([sheetW, sheetH]);
    placeSide(front, sheet.front, embedded, { ...ctx, sheetIndex: sheet.index });
    placeSide(back, sheet.back, embedded, { ...ctx, sheetIndex: sheet.index });
    opts.onProgress?.(sheet.index + 1, result.sheetCount);
  }

  out.setTitle('Imposed booklet (saddle stitch)');
  out.setCreator('Booklet Imposition Tool');
  out.setProducer('pdf-lib + browser imposition');
  out.catalog.set(PDFName.of('BookletFlip'), PDFName.of(result.flip === 'short' ? 'ShortEdge' : 'LongEdge'));

  return out.save({ useObjectStreams: true });
}

interface PlaceCtx {
  halfW: number;
  sheetH: number;
  bleed: number;
  safety: number;
  creepPerSheet: number;
  sheetIndex?: number;
  sheetCount: number;
  drawMarks: boolean;
  markBlanks: boolean;
  font: PDFFont;
}

function placeSide(target: PDFPage, panels: PlacedPanel[], embedded: Map<number, Embedded>, c: PlaceCtx): void {
  for (const p of panels) {
    // 实际打印到纸的物理半张：背面翻纸后左右镜像（与预览共用 physicalHalf）
    const physHalf = physicalHalf(p);
    const baseX = physHalf === 'L' ? 0 : c.halfW;
    // 爬移：越靠内帖（index 越大），内容向书口外修正；爬移方向随物理半张
    const creep = c.creepPerSheet * (c.sheetCount - 1 - (c.sheetIndex ?? 0));
    const x = baseX + (physHalf === 'L' ? creep : -creep);
    const box = { x, y: 0, w: c.halfW, h: c.sheetH };

    if (p.page.kind === 'content' && p.page.sourcePage !== null) {
      const e = embedded.get(p.page.sourcePage);
      if (e) drawSourcePage(target, e, box, c.bleed);
    } else if (c.markBlanks) {
      drawBlankMarker(target, box, p, c.font);
    }

    if (c.drawMarks) {
      drawTrimGuides(target, box, c.bleed);
      drawSafetyBox(target, box, c.safety);
    }
  }
}

/**
 * 等比缩放源页填满“成品 + 出血”区域，绕面板中心放置。
 * 需要 180° 时旋转已在嵌入矩阵中预置（[-1,0,0,-1,w,h]），两种情况占同一 w×h 盒，
 * 故统一用左下角定位。全程矢量，不光栅化。
 */
function drawSourcePage(target: PDFPage, e: Embedded, box: { x: number; y: number; w: number; h: number }, bleed: number): void {
  const contentW = box.w + 2 * bleed;
  const contentH = box.h + 2 * bleed;
  const s = Math.min(contentW / e.width, contentH / e.height);
  const w = e.width * s;
  const h = e.height * s;
  target.drawPage(e.emb, {
    x: box.x + box.w / 2 - w / 2,
    y: box.y + box.h / 2 - h / 2,
    xScale: s,
    yScale: s,
  });
}

function drawBlankMarker(page: PDFPage, box: { x: number; y: number; w: number; h: number }, p: PlacedPanel, font: PDFFont): void {
  const excluded = p.page.kind === 'excluded';
  const g = excluded ? rgb(0.82, 0.62, 0.62) : rgb(0.72, 0.72, 0.8);
  page.drawRectangle({ x: box.x + 4, y: box.y + 4, width: box.w - 8, height: box.h - 8, borderColor: g, borderWidth: 1.5 });
  page.drawLine({ start: { x: box.x + 10, y: box.y + 10 }, end: { x: box.x + box.w - 10, y: box.y + box.h - 10 }, color: g, thickness: 1 });
  page.drawLine({ start: { x: box.x + box.w - 10, y: box.y + 10 }, end: { x: box.x + 10, y: box.y + box.h - 10 }, color: g, thickness: 1 });
  page.drawText(excluded ? `EXCLUDED #${p.position}` : `BLANK #${p.position}`, {
    x: box.x + 12,
    y: box.y + 14,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.45),
  });
}

function drawTrimGuides(page: PDFPage, box: { x: number; y: number; w: number; h: number }, bleed: number): void {
  const m = bleed;
  const len = 10;
  const col = rgb(0.2, 0.2, 0.2);
  const L = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: col, thickness: 0.5 });
  const { x, y, w, h } = box;
  // 四角裁切线，位于出血外侧
  L(x - m, y + h + m - len, x - m, y + h + m);
  L(x - m, y + h + m, x - m + len, y + h + m);
  L(x + w + m, y + h + m, x + w + m - len, y + h + m);
  L(x + w + m, y + h + m, x + w + m, y + h + m - len);
  L(x - m, y - m + len, x - m, y - m);
  L(x - m, y - m, x - m + len, y - m);
  L(x + w + m, y - m + len, x + w + m, y - m);
  L(x + w + m, y - m, x + w + m - len, y - m);
}

function drawSafetyBox(page: PDFPage, box: { x: number; y: number; w: number; h: number }, safety: number): void {
  page.drawRectangle({
    x: box.x + safety,
    y: box.y + safety,
    width: box.w - 2 * safety,
    height: box.h - 2 * safety,
    borderColor: rgb(0.2, 0.55, 0.9),
    borderWidth: 0.4,
  });
}
