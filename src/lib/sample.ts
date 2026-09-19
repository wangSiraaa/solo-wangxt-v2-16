/**
 * 内置样册生成：8 页与 11 页骑马订样本。
 * 每页醒目展示页码与朝向标记（顶部色条 + 角标），用于人工核对：
 *  - 折叠后页码是否连续
 *  - 长/短边翻转后背面方向是否正确
 *  - 11 页样本补 1 页补白（位置 12，落在封面帖封背/书心位置）
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';

// A4 纵向成品页（pt）
const PAGE_W = 595.28;
const PAGE_H = 841.89;

export async function makeSamplePdf(pageCount: 8 | 11): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const small = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawSamplePage(page, i, pageCount, font, small);
  }

  doc.setTitle(`Sample booklet ${pageCount} pages`);
  doc.setCreator('Booklet Imposition Tool');
  return doc.save();
}

function drawSamplePage(page: PDFPage, n: number, total: number, big: import('pdf-lib').PDFFont, small: import('pdf-lib').PDFFont) {
  const W = page.getWidth();
  const H = page.getHeight();
  const hue = (n * 0.382) % 1;
  const c = hsl(hue, 0.55, 0.72);
  const dark = hsl(hue, 0.55, 0.32);

  // 顶部色条（朝向参考：成品阅读时应在上方）
  page.drawRectangle({ x: 0, y: H - 60, width: W, height: 60, color: c });
  page.drawRectangle({ x: 0, y: 0, width: W, height: 18, color: c });

  // 巨大页码
  const label = String(n);
  const size = 220;
  const tw = big.widthOfTextAtSize(label, size);
  page.drawText(label, { x: (W - tw) / 2, y: H * 0.42, size, font: big, color: dark });

  // 顶部文字“UP / 页码 n / 共 total”
  page.drawText(`UP — Page ${n} of ${total}`, { x: 24, y: H - 42, size: 20, font: small, color: rgb(0.15, 0.15, 0.15) });
  // 四角方向标记：左上角实心心点
  page.drawCircle({ x: 30, y: H - 90, size: 10, color: rgb(0.9, 0.15, 0.2) });
  page.drawText(`top-left p${n}`, { x: 24, y: 40, size: 10, font: small, color: dark });

  // 一个右向箭头（用线条绘制），进一步暴露任何旋转/镜像错误
  const ax = W - 110;
  const ay = H * 0.42;
  page.drawLine({ start: { x: ax, y: ay }, end: { x: ax + 55, y: ay }, color: dark, thickness: 6 });
  page.drawLine({ start: { x: ax + 55, y: ay }, end: { x: ax + 35, y: ay + 16 }, color: dark, thickness: 6 });
  page.drawLine({ start: { x: ax + 55, y: ay }, end: { x: ax + 35, y: ay - 16 }, color: dark, thickness: 6 });
}

/** 简易 HSL->RGB（0..1） */
function hsl(h: number, s: number, l: number): ReturnType<typeof rgb> {
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgb(f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3));
}
