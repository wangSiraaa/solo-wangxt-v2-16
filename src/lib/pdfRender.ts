/**
 * PDF 处理：PDF.js 仅用于“原页预览渲染”；pdf-lib 用于“最终拼版导出”。
 * 二者严格分离：
 *   - 屏幕上的缩略图/预览是低分辨率位图，绝不进入导出链路；
 *   - 导出时始终基于导入时保存的原始 PDF 字节重新 copyPages，保持矢量与原始分辨率。
 */
import * as pdfjsLib from 'pdfjs-dist';
// Vite 把 worker 构建为独立资源
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerSet = false;
function ensureWorker() {
  if (workerSet) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  workerSet = true;
}

export interface LoadedPdf {
  bytes: Uint8Array;
  pageCount: number;
  /** 每页原尺寸 pt */
  pageSizes: { width: number; height: number }[];
  doc: pdfjsLib.PDFDocumentProxy;
}

export async function loadPdf(bytes: Uint8Array): Promise<LoadedPdf> {
  ensureWorker();
  // pdf.js 会接管 buffer；传入拷贝避免外部 ArrayBuffer 被转移
  const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const doc = await task.promise;
  const pageSizes: { width: number; height: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    pageSizes.push({ width: vp.width, height: vp.height });
  }
  return { bytes, pageCount: doc.numPages, pageSizes, doc };
}

/**
 * 渲染单页为画布（仅屏幕预览用）。
 * @param maxLongSide 预览最长边像素（低分辨率，明确不是输出质量）
 */
export async function renderPreview(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber1: number,
  maxLongSide: number,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, maxLongSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
