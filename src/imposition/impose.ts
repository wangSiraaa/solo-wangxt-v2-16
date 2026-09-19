import type { DuplexFlip, ImpositionPlan, Sheet, Slot } from '../types'

const slot = (page: number | null): Slot => ({ page, blank: page === null })

/**
 * 对一组逻辑页（1..n 的序号，映射到 includedPages）做骑马订 2-up 拼版。
 * 返回的 slot.page 为 includedPages 的下标（0 起），调用方负责映射回原始页码。
 */
function imposeSequence(count: number, cover: boolean, flip: DuplexFlip, startIndex: number) {
  const padded = Math.max(4, Math.ceil(count / 4) * 4)
  const blanks: number[] = []
  for (let p = count + 1; p <= padded; p++) blanks.push(p) // 逻辑序号（1 起）
  const sheets: Sheet[] = []
  const sheetCount = padded / 4
  // 逻辑页号（1 起）→ includedPages 下标；超出实际页数则为补白
  const idx = (logical: number) => (logical > count ? null : logical - 1)
  for (let i = 0; i < sheetCount; i++) {
    // 标准骑马订：第 i 张纸
    // 正面：左 = P-2i，右 = 2i+1；背面：左 = 2i+2，右 = P-2i-1
    sheets.push({
      index: startIndex + i,
      cover,
      front: {
        left: slot(idx(padded - 2 * i)),
        right: slot(idx(2 * i + 1)),
        rotated: false,
      },
      back: {
        left: slot(idx(2 * i + 2)),
        right: slot(idx(padded - 2 * i - 1)),
        rotated: flip === 'short-edge',
      },
    })
  }
  return { sheets, padded, blanks }
}

/**
 * 计算整本册子的拼版方案。
 * @param totalPages 原 PDF 总页数
 * @param excluded   被排除的原始页码（1 起）
 * @param separateCover 封面单独计纸：第 1、2 页与倒数第 1、2 页（在有效页序列中）单独成封面纸
 */
export function computeImposition(
  totalPages: number,
  excluded: ReadonlySet<number>,
  separateCover: boolean,
  flip: DuplexFlip,
): ImpositionPlan {
  const includedPages: number[] = []
  for (let p = 1; p <= totalPages; p++) {
    if (!excluded.has(p)) includedPages.push(p)
  }
  const n = includedPages.length

  const allSheets: Sheet[] = []
  const blankPositions: number[] = []
  let paddedCount = 0
  let coverSheetCount = 0

  if (separateCover && n >= 8) {
    // 封面纸：有效页序列的第 1、2 与最后 2 页
    const coverIdx = [0, 1, n - 2, n - 1]
    const bodyIdx: number[] = []
    for (let i = 2; i < n - 2; i++) bodyIdx.push(i)

    // 封面 = 4 页一张纸：正面 [封底, 封面]，背面 [封二, 封三]
    const c = (i: number) => coverIdx[i]
    allSheets.push({
      index: 0,
      cover: true,
      front: { left: slot(c(3)), right: slot(c(0)), rotated: false },
      back: { left: slot(c(1)), right: slot(c(2)), rotated: flip === 'short-edge' },
    })
    coverSheetCount = 1
    paddedCount += 4

    // 正文
    const body = imposeSequence(bodyIdx.length, false, flip, 1)
    // body 的 slot.page 是 bodyIdx 的下标，需要映射回 includedPages 下标
    for (const s of body.sheets) {
      for (const side of [s.front, s.back]) {
        for (const sl of [side.left, side.right]) {
          if (sl.page !== null) sl.page = bodyIdx[sl.page]
        }
      }
    }
    allSheets.push(...body.sheets)
    paddedCount += body.padded
    // 补白在整本逻辑序列中的位置：封面 4 页之后
    for (const b of body.blanks) blankPositions.push(4 + b)
  } else {
    const body = imposeSequence(n, false, flip, 0)
    allSheets.push(...body.sheets)
    paddedCount = body.padded
    blankPositions.push(...body.blanks)
  }

  // slot.page 目前仍是 includedPages 下标；在返回前统一映射为原始页码
  for (const s of allSheets) {
    for (const side of [s.front, s.back]) {
      for (const sl of [side.left, side.right]) {
        if (sl.page !== null) sl.page = includedPages[sl.page]
      }
    }
  }

  return {
    sheets: allSheets,
    paddedCount,
    includedPages,
    blankPositions,
    bodySheetCount: allSheets.length - coverSheetCount,
    coverSheetCount,
  }
}
