import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * 生成样册 PDF（A5 页面），每页印有大号页码与方向标记，
 * 便于核对拼版后的页序、补白与旋转方向。
 */
export async function generateSamplePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const font2 = await doc.embedFont(StandardFonts.Helvetica)
  const W = 419.53 // A5 宽 pt
  const H = 595.28 // A5 高 pt
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([W, H])
    // 边框便于检查出血/裁切
    page.drawRectangle({
      x: 14,
      y: 14,
      width: W - 28,
      height: H - 28,
      borderWidth: 1.5,
      borderColor: rgb(0.2, 0.4, 0.8),
    })
    const label = `${i}`
    const size = 200
    const w = font.widthOfTextAtSize(label, size)
    page.drawText(label, {
      x: (W - w) / 2,
      y: H / 2 - 70,
      size,
      font: font,
      color: rgb(0.15, 0.15, 0.15),
    })
    page.drawText(`Page ${i} / ${pageCount}`, {
      x: 40,
      y: H - 60,
      size: 16,
      font: font2,
      color: rgb(0.4, 0.4, 0.4),
    })
    // 顶部方向标记（正立时朝上），用于验证翻转方向
    page.drawText('TOP', { x: W / 2 - 12, y: H - 40, size: 14, font: font2, color: rgb(0.8, 0.2, 0.2) })
    page.drawSvgPath('M 0 10 L 6 0 L 12 10 Z', {
      x: W / 2 - 6,
      y: H - 58,
      color: rgb(0.8, 0.2, 0.2),
    })
    page.drawText(`page ${i}`, { x: W / 2 - 20, y: 24, size: 10, font: font2, color: rgb(0.6, 0.6, 0.6) })
  }
  return doc.save()
}
