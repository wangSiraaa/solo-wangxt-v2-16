/** 纸张规格（毫米） */
export interface PaperSpec {
  id: string
  label: string
  /** 短边 mm */
  width: number
  /** 长边 mm */
  height: number
}

export const PAPER_PRESETS: PaperSpec[] = [
  { id: 'A4', label: 'A4 (210 × 297)', width: 210, height: 297 },
  { id: 'A3', label: 'A3 (297 × 420)', width: 297, height: 420 },
  { id: 'Letter', label: 'Letter (216 × 279)', width: 215.9, height: 279.4 },
  { id: 'Tabloid', label: 'Tabloid (279 × 432)', width: 279.4, height: 431.8 },
]

/** 双面翻转方式 */
export type DuplexFlip = 'long-edge' | 'short-edge'

export interface ImpositionSettings {
  /** 正文纸张 */
  paperId: string
  /** 封面单独计纸：封面/封底用独立纸张设置 */
  separateCover: boolean
  /** 封面纸张（separateCover 时生效） */
  coverPaperId: string
  duplexFlip: DuplexFlip
  /** 出血 mm（四边相同） */
  bleed: number
}

export const DEFAULT_SETTINGS: ImpositionSettings = {
  paperId: 'A4',
  separateCover: false,
  coverPaperId: 'A4',
  duplexFlip: 'long-edge',
  bleed: 3,
}

/** 纸面上一个页槽 */
export interface Slot {
  /** 原始页码（1 起）；null 表示补白 */
  page: number | null
  blank: boolean
}

export interface SheetSide {
  left: Slot
  right: Slot
  /** 背面在短边翻转时需整体旋转 180° */
  rotated: boolean
}

export interface Sheet {
  index: number
  /** 是否封面纸 */
  cover: boolean
  front: SheetSide
  back: SheetSide
}

export interface ImpositionPlan {
  sheets: Sheet[]
  /** 逻辑总页数（含补白，不含被排除页） */
  paddedCount: number
  /** 参与拼版的有效页（升序页码） */
  includedPages: number[]
  /** 补白所在的逻辑页码（在 padded 序列中的位置，1 起） */
  blankPositions: number[]
  bodySheetCount: number
  coverSheetCount: number
}
