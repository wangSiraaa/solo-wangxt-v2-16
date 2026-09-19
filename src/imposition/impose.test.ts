import { describe, expect, it } from 'vitest'
import { computeImposition } from './impose'

const seq = (plan: ReturnType<typeof computeImposition>) =>
  plan.sheets.flatMap((s) => [
    [s.front.left.page, s.front.right.page],
    [s.back.left.page, s.back.right.page],
  ])

describe('computeImposition', () => {
  it('8 页样册：2 张纸，无补白', () => {
    const plan = computeImposition(8, new Set(), false, 'long-edge')
    expect(plan.sheets).toHaveLength(2)
    expect(plan.blankPositions).toEqual([])
    expect(plan.paddedCount).toBe(8)
    // 第 1 张：正面 [8,1]，背面 [2,7]；第 2 张：正面 [6,3]，背面 [4,5]
    expect(seq(plan)).toEqual([
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ])
  })

  it('11 页样册：补 1 白，补白位置明确', () => {
    const plan = computeImposition(11, new Set(), false, 'long-edge')
    expect(plan.paddedCount).toBe(12)
    expect(plan.blankPositions).toEqual([12])
    expect(plan.sheets).toHaveLength(3)
    // 第 1 张正面左槽应为补白（逻辑第 12 页）
    expect(plan.sheets[0].front.left.page).toBeNull()
    expect(plan.sheets[0].front.left.blank).toBe(true)
    expect(plan.sheets[0].front.right.page).toBe(1)
    // 最后一页（11）与补白同张：第 1 张背面右 = 11
    expect(plan.sheets[0].back.right.page).toBe(11)
    // 每个有效页恰好出现一次
    const pages = seq(plan).flat().filter((p) => p !== null) as number[]
    expect(pages.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('短边翻转：背面旋转，正面不转', () => {
    const plan = computeImposition(8, new Set(), false, 'short-edge')
    for (const s of plan.sheets) {
      expect(s.front.rotated).toBe(false)
      expect(s.back.rotated).toBe(true)
    }
    const longPlan = computeImposition(8, new Set(), false, 'long-edge')
    for (const s of longPlan.sheets) expect(s.back.rotated).toBe(false)
  })

  it('排除指定页后按有效页重新拼版', () => {
    const plan = computeImposition(8, new Set([3, 6]), false, 'long-edge')
    expect(plan.includedPages).toEqual([1, 2, 4, 5, 7, 8])
    expect(plan.paddedCount).toBe(8) // 6 有效页补到 8
    expect(plan.blankPositions).toEqual([7, 8])
    const pages = seq(plan).flat().filter((p) => p !== null) as number[]
    expect(pages.sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 7, 8])
  })

  it('封面单独计纸：封面 4 页独立成纸，正文另算', () => {
    const plan = computeImposition(12, new Set(), true, 'long-edge')
    expect(plan.coverSheetCount).toBe(1)
    expect(plan.bodySheetCount).toBe(2)
    const cover = plan.sheets[0]
    expect(cover.cover).toBe(true)
    // 封面纸：正面 [12, 1]，背面 [2, 11]
    expect([cover.front.left.page, cover.front.right.page]).toEqual([12, 1])
    expect([cover.back.left.page, cover.back.right.page]).toEqual([2, 11])
    // 正文为第 3..10 页，8 页 2 张纸
    const bodyPages = plan.sheets
      .slice(1)
      .flatMap((s) => [s.front.left.page, s.front.right.page, s.back.left.page, s.back.right.page])
      .filter((p) => p !== null) as number[]
    expect(bodyPages.sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('封面分纸 + 11 页：正文 7 页补 1 白，补白在正文末尾', () => {
    const plan = computeImposition(11, new Set(), true, 'long-edge')
    // 封面 = 1,2,10,11；正文 = 3..9 共 7 页 → 补到 8
    expect(plan.blankPositions).toEqual([4 + 8])
    const bodyPages = plan.sheets
      .slice(1)
      .flatMap((s) => [s.front.left.page, s.front.right.page, s.back.left.page, s.back.right.page])
    expect(bodyPages.filter((p) => p === null)).toHaveLength(1)
    const real = bodyPages.filter((p) => p !== null) as number[]
    expect(real.sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9])
  })

  it('有效页不足 8 页时自动退化为整本拼版', () => {
    const plan = computeImposition(6, new Set(), true, 'long-edge')
    expect(plan.coverSheetCount).toBe(0)
    expect(plan.paddedCount).toBe(8)
  })

  it('任意页数每个有效页只出现一次', () => {
    for (const n of [4, 5, 7, 9, 13, 16, 21, 40]) {
      const plan = computeImposition(n, new Set(), false, 'long-edge')
      const pages = seq(plan).flat().filter((p) => p !== null) as number[]
      expect(pages.sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
      expect(plan.paddedCount % 4).toBe(0)
    }
  })
})
