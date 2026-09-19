import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface PageInfo {
  pageNumber: number
  /** 页面尺寸，单位 mm */
  widthMm: number
  heightMm: number
}

export interface PdfDocument {
  pageCount: number
  pages: PageInfo[]
  /** 渲染某页为低分辨率预览位图（仅用于屏幕预览，绝不用于导出） */
  renderPage(pageNumber: number, targetWidthPx: number): Promise<HTMLCanvasElement>
  destroy(): void
}

const PT_PER_MM = 72 / 25.4

export async function openPdf(data: ArrayBuffer): Promise<PdfDocument> {
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: PageInfo[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    pages.push({
      pageNumber: i,
      widthMm: vp.width / PT_PER_MM,
      heightMm: vp.height / PT_PER_MM,
    })
  }
  return {
    pageCount: doc.numPages,
    pages,
    async renderPage(pageNumber: number, targetWidthPx: number) {
      const page = await doc.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = targetWidthPx / base.width
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
      return canvas
    },
    destroy() {
      doc.destroy()
    },
  }
}
