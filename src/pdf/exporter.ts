import { PDFDocument, degrees, rgb } from 'pdf-lib'
import type { ImpositionPlan, ImpositionSettings, PaperSpec } from '../types'
import { PAPER_PRESETS } from '../types'
import type { PageInfo } from './preview'

const MM = 72 / 25.4

export function paperById(id: string): PaperSpec {
  return PAPER_PRESETS.find((p) => p.id === id) ?? PAPER_PRESETS[0]
}

/** 纸张横放（长边水平）作为一张拼版纸 */
export function sheetSize(paper: PaperSpec) {
  return { width: paper.height, height: paper.width } // mm
}

/**
 * 用 pdf-lib 生成拼版 PDF。
 * 原页通过 embedPdf 以矢量形式嵌入，与屏幕上的低分辨率预览位图无关。
 */
export async function exportImposedPdf(
  sourceBytes: ArrayBuffer,
  plan: ImpositionPlan,
  settings: ImpositionSettings,
  pageInfos: PageInfo[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(sourceBytes)
  const out = await PDFDocument.create()
  out.setTitle(' imposed-booklet')
  out.setProducer('booklet-imposition (browser)')

  const embedded = await out.embedPdf(await src.save(), plan.includedPages.map((p) => p - 1))
  const byOriginalPage = new Map<number, (typeof embedded)[number]>()
  plan.includedPages.forEach((orig, i) => byOriginalPage.set(orig, embedded[i]))

  const bodyPaper = paperById(settings.paperId)
  const coverPaper = paperById(settings.coverPaperId)

  for (const sheet of plan.sheets) {
    const paper = sheet.cover && settings.separateCover ? coverPaper : bodyPaper
    const size = sheetSize(paper)
    const slotW = size.width / 2
    const slotH = size.height

    for (const side of [sheet.front, sheet.back]) {
      const page = out.addPage([size.width * MM, size.height * MM])
      // 折线（纸中央）
      page.drawLine({
        start: { x: slotW * MM, y: 0 },
        end: { x: slotW * MM, y: size.height * MM },
        thickness: 0.3,
        color: rgb(0.75, 0.75, 0.75),
        dashArray: [4, 4],
      })
      const slots = [
        { slot: side.left, x0: 0 },
        { slot: side.right, x0: slotW },
      ]
      for (const { slot, x0 } of slots) {
        // 裁切框（页槽边界）
        page.drawRectangle({
          x: x0 * MM,
          y: 0,
          width: slotW * MM,
          height: slotH * MM,
          borderWidth: 0.3,
          borderColor: rgb(0.8, 0.8, 0.8),
        })
        if (slot.page === null) continue // 补白：留空
        const emb = byOriginalPage.get(slot.page)
        const info = pageInfos[slot.page - 1]
        if (!emb || !info) continue
        const pw = info.widthMm
        const ph = info.heightMm
        if (side.rotated) {
          // 短边翻转：背面整体旋转 180°，围绕页槽中心
          page.drawPage(emb, {
            x: (x0 + slotW / 2 + pw / 2) * MM,
            y: (slotH / 2 + ph / 2) * MM,
            width: pw * MM,
            height: ph * MM,
            rotate: degrees(180),
          })
        } else {
          page.drawPage(emb, {
            x: (x0 + (slotW - pw) / 2) * MM,
            y: ((slotH - ph) / 2) * MM,
            width: pw * MM,
            height: ph * MM,
          })
        }
      }
    }
  }
  return out.save()
}
