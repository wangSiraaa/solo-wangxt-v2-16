import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { generateSamplePdf } from './sample'
import { computeImposition } from '../imposition/impose'
import { exportImposedPdf } from './exporter'
import { DEFAULT_SETTINGS, type ImpositionSettings } from '../types'
import type { PageInfo } from './preview'

const A5: PageInfo = { pageNumber: 0, widthMm: 148, heightMm: 210 }
const infos = (n: number) => Array.from({ length: n }, (_, i) => ({ ...A5, pageNumber: i + 1 }))

async function makeExport(pages: number, settings: Partial<ImpositionSettings> = {}) {
  const src = await generateSamplePdf(pages)
  const buf = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer
  const s: ImpositionSettings = { ...DEFAULT_SETTINGS, ...settings }
  const plan = computeImposition(pages, new Set(), s.separateCover, s.duplexFlip)
  const out = await exportImposedPdf(buf, plan, s, infos(pages))
  return { out, plan }
}

async function pageContent(doc: PDFDocument, index: number): Promise<string> {
  const page = doc.getPage(index)
  const contents = page.node.get(PDFName.of('Contents'))
  const streams: PDFRawStream[] = []
  const collect = (obj: unknown) => {
    const resolved = doc.context.lookup(obj as never)
    if (resolved instanceof PDFRawStream) streams.push(resolved)
    else if (resolved && typeof resolved === 'object' && 'asArray' in resolved) {
      for (const item of (resolved as { asArray(): unknown[] }).asArray()) collect(item)
    }
  }
  collect(contents)
  return streams
    .map((s) => {
      const raw = Buffer.from(s.getContents())
      try {
        return inflateSync(raw).toString('latin1')
      } catch {
        return raw.toString('latin1')
      }
    })
    .join('\n')
}

describe('exportImposedPdf', () => {
  it('11 页样册：输出 6 面（3 张纸 × 正反），A4 横放', async () => {
    const { out, plan } = await makeExport(11)
    expect(plan.sheets).toHaveLength(3)
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(6)
    const p = doc.getPage(0)
    // A4 横放：297 × 210 mm
    expect(p.getWidth()).toBeCloseTo((297 * 72) / 25.4, 1)
    expect(p.getHeight()).toBeCloseTo((210 * 72) / 25.4, 1)
  })

  it('8 页样册：输出 4 面，无补白', async () => {
    const { out, plan } = await makeExport(8)
    expect(plan.blankPositions).toEqual([])
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(4)
  })

  it('短边翻转的背面内容流含 180° 旋转矩阵，长边翻转不含', async () => {
    const { out: shortOut } = await makeExport(8, { duplexFlip: 'short-edge' })
    const shortDoc = await PDFDocument.load(shortOut)
    const back = await pageContent(shortDoc, 1) // 第 1 张纸背面
    // 180° 旋转矩阵：-1 ≈0 -≈0 -1（含浮点噪声）
    expect(back).toMatch(/-1 0\.\d+ -0\.\d+ -1/)

    const { out: longOut } = await makeExport(8, { duplexFlip: 'long-edge' })
    const longDoc = await PDFDocument.load(longOut)
    const longBack = await pageContent(longDoc, 1)
    expect(longBack).not.toMatch(/-1 0\.\d+ -0\.\d+ -1/)
  })

  it('封面单独计纸：封面纸尺寸可与正文不同', async () => {
    const { out, plan } = await makeExport(12, { separateCover: true, coverPaperId: 'A3' })
    expect(plan.coverSheetCount).toBe(1)
    const doc = await PDFDocument.load(out)
    // 前 2 面为 A3 横放封面纸
    expect(doc.getPage(0).getWidth()).toBeCloseTo((420 * 72) / 25.4, 1)
    expect(doc.getPage(1).getWidth()).toBeCloseTo((420 * 72) / 25.4, 1)
    // 后面为 A4 正文纸
    expect(doc.getPage(2).getWidth()).toBeCloseTo((297 * 72) / 25.4, 1)
  })
})
