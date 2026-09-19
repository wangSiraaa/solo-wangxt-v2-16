import type { ImpositionPlan, ImpositionSettings } from '../types'
import { paperById, sheetSize } from '../pdf/exporter'
import type { PageInfo } from './preview'

export type CheckLevel = 'pass' | 'warn' | 'error'

export interface CheckResult {
  level: CheckLevel
  title: string
  detail: string
}

/** 导出前检查：页序、补白、出血/裁切、分辨率提示 */
export function runPreflightChecks(
  plan: ImpositionPlan | null,
  settings: ImpositionSettings,
  pageInfos: PageInfo[],
  excludedCount: number,
): CheckResult[] {
  const results: CheckResult[] = []
  if (!plan || pageInfos.length === 0) {
    results.push({ level: 'error', title: '未导入 PDF', detail: '请先导入 PDF 或加载样册。' })
    return results
  }

  // 1. 页数
  const n = plan.includedPages.length
  results.push(
    n >= 4
      ? { level: 'pass', title: '有效页数', detail: `${n} 页参与拼版（排除 ${excludedCount} 页）。` }
      : { level: 'error', title: '有效页数不足', detail: `仅 ${n} 页，骑马订至少需要 4 页。` },
  )

  // 2. 补白
  if (plan.blankPositions.length > 0) {
    results.push({
      level: 'warn',
      title: '存在补白页',
      detail: `页数不是 4 的倍数，已在逻辑第 ${plan.blankPositions.join('、')} 页补白（成书末尾）。`,
    })
  } else {
    results.push({ level: 'pass', title: '无补白', detail: '页数恰好为 4 的倍数。' })
  }

  // 3. 出血与裁切：逐页核对页槽
  const checkFit = (paperId: string, label: string, pages: number[]) => {
    const size = sheetSize(paperById(paperId))
    const slotW = size.width / 2
    const slotH = size.height
    let overflow: string[] = []
    let bleedShort: string[] = []
    for (const p of pages) {
      const info = pageInfos[p - 1]
      if (!info) continue
      const dw = slotW - info.widthMm
      const dh = slotH - info.heightMm
      if (dw < -0.5 || dh < -0.5) {
        overflow.push(`第 ${p} 页（${info.widthMm.toFixed(0)}×${info.heightMm.toFixed(0)}mm 超出页槽 ${slotW.toFixed(0)}×${slotH.toFixed(0)}mm）`)
      } else if (dw < settings.bleed * 2 || dh < settings.bleed * 2) {
        bleedShort.push(`第 ${p} 页（页槽余量 ${Math.max(dw, 0).toFixed(1)}×${Math.max(dh, 0).toFixed(1)}mm，小于出血 ${settings.bleed}mm×2）`)
      }
    }
    if (overflow.length) {
      results.push({ level: 'error', title: `${label}裁切范围溢出`, detail: overflow.slice(0, 3).join('；') + (overflow.length > 3 ? ` 等 ${overflow.length} 页` : '') })
    } else if (bleedShort.length) {
      results.push({ level: 'warn', title: `${label}出血不足`, detail: bleedShort.slice(0, 3).join('；') + (bleedShort.length > 3 ? ` 等 ${bleedShort.length} 页` : '') })
    } else {
      results.push({ level: 'pass', title: `${label}出血/裁切`, detail: `所有页面在 ${slotW.toFixed(0)}×${slotH.toFixed(0)}mm 页槽内且满足 ${settings.bleed}mm 出血。` })
    }
  }

  if (settings.separateCover && plan.coverSheetCount > 0) {
    const coverPages: number[] = []
    const bodyPages: number[] = []
    for (const s of plan.sheets) {
      for (const side of [s.front, s.back]) {
        for (const sl of [side.left, side.right]) {
          if (sl.page !== null) (s.cover ? coverPages : bodyPages).push(sl.page)
        }
      }
    }
    checkFit(settings.coverPaperId, '封面纸 ', coverPages)
    checkFit(settings.paperId, '正文纸 ', bodyPages)
  } else {
    checkFit(settings.paperId, '', plan.includedPages)
  }

  // 4. 分辨率提示
  results.push({
    level: 'pass',
    title: '输出质量',
    detail: '导出使用 pdf-lib 矢量嵌入原始页面，屏幕上的低分辨率预览图不会进入最终 PDF。',
  })

  return results
}
