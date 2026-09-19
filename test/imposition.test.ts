import { describe, it, expect } from 'vitest';
import { impose, readingOrder, panelRotation, physicalHalf, padPages, buildPages, saddleSequence } from '../src/lib/imposition';

describe('补白', () => {
  it('8 页无需补白', () => {
    const r = impose(8, new Set(), 'short');
    expect(r.totalPositions).toBe(8);
    expect(r.blankPositions).toEqual([]);
    expect(r.sheetCount).toBe(2);
  });
  it('11 页补到 12，补白位置 12', () => {
    const r = impose(11, new Set(), 'short');
    expect(r.totalPositions).toBe(12);
    expect(r.blankPositions).toEqual([12]);
    expect(r.sheetCount).toBe(3);
    expect(r.pages[11]).toMatchObject({ position: 12, sourcePage: null, kind: 'blank' });
  });
  it('非 4 倍数通用规则', () => {
    for (const n of [1, 2, 3, 5, 6, 7, 9, 10, 11, 13]) {
      const { paddedTo } = padPages(buildPages(n, new Set()).pages);
      expect(paddedTo % 4).toBe(0);
      expect(paddedTo).toBeGreaterThanOrEqual(n);
    }
  });
});

describe('骑马订页序（8 页）', () => {
  const r = impose(8, new Set(), 'short');
  it('外帖正面 8 | 1', () => {
    const s0 = r.sheets[0];
    expect(s0.front.map((p) => p.position)).toEqual([8, 1]);
  });
  it('外帖背面（从 PDF 坐标）7 | 2', () => {
    expect(r.sheets[0].back.map((p) => p.position)).toEqual([7, 2]);
  });
  it('内帖正面 6 | 3', () => {
    expect(r.sheets[1].front.map((p) => p.position)).toEqual([6, 3]);
  });
  it('内帖背面 5 | 4', () => {
    expect(r.sheets[1].back.map((p) => p.position)).toEqual([5, 4]);
  });
  it('封面（1）与封底（8）在最外帖', () => {
    expect(r.sheets[0].front.map((p) => p.position)).toContain(1);
    expect(r.sheets[0].front.map((p) => p.position)).toContain(8);
  });
});

describe('阅读顺序', () => {
  it('8 页：封面1 → 2|3 → 4|5 → 6|7 → 封底8', () => {
    const seq = readingOrder(8);
    expect(seq).toEqual([
      { kind: 'cover', left: null, right: 1 },
      { kind: 'opening', left: 2, right: 3 },
      { kind: 'opening', left: 4, right: 5 },
      { kind: 'opening', left: 6, right: 7 },
      { kind: 'back', left: 8, right: null },
    ]);
  });
  it('4 页：1 → 2|3 → 4', () => {
    expect(readingOrder(4)).toEqual([
      { kind: 'cover', left: null, right: 1 },
      { kind: 'opening', left: 2, right: 3 },
      { kind: 'back', left: 4, right: null },
    ]);
  });
});

describe('长/短边翻转旋转规则', () => {
  it('短边：所有面板 0°', () => {
    for (const k of ['LA', 'RA', 'LB', 'RB'] as const) expect(panelRotation(k, 'short')).toBe(0);
  });
  it('长边：背面 LB/RB 为 180°，正面为 0°', () => {
    expect(panelRotation('LA', 'long')).toBe(0);
    expect(panelRotation('RA', 'long')).toBe(0);
    expect(panelRotation('LB', 'long')).toBe(180);
    expect(panelRotation('RB', 'long')).toBe(180);
  });
  it('11 页补白后长边旋转仍一致', () => {
    const r = impose(11, new Set(), 'long');
    for (const s of r.sheets) {
      expect(s.front.every((p) => p.rotationDeg === 0)).toBe(true);
      expect(s.back.every((p) => p.rotationDeg === 180)).toBe(true);
    }
  });
});

describe('背面物理半张镜像', () => {
  it('正面面板物理半张等于面板名', () => {
    const r = impose(8, new Set(), 'short');
    for (const p of r.sheets[0].front) expect(physicalHalf(p)).toBe(p.half);
  });
  it('背面面板物理半张与面板名相反（翻纸左右镜像）', () => {
    const r = impose(8, new Set(), 'short');
    for (const p of r.sheets[0].back) {
      expect(physicalHalf(p)).toBe(p.half === 'L' ? 'R' : 'L');
    }
  });
  it('8 页：背面左页 2 落在纸左半张、右页 7 落在纸右半张', () => {
    const r = impose(8, new Set(), 'short');
    const back = r.sheets[0].back;
    const p2 = back.find((p) => p.position === 2)!; // RB
    const p7 = back.find((p) => p.position === 7)!; // LB
    expect(p2.key).toBe('RB');
    expect(physicalHalf(p2)).toBe('L');
    expect(p7.key).toBe('LB');
    expect(physicalHalf(p7)).toBe('R');
  });
  it('物理半张镜像与长短边翻转无关（差异只在旋转）', () => {
    for (const flip of ['short', 'long'] as const) {
      const r = impose(8, new Set(), flip);
      expect(physicalHalf(r.sheets[0].back[0])).toBe('R');
      expect(physicalHalf(r.sheets[0].back[1])).toBe('L');
    }
  });
});

describe('排除页', () => {
  it('排除第 2 页后位置保留但标记 excluded', () => {
    const r = impose(8, new Set([2]), 'short');
    const p2 = r.pages.find((p) => p.position === 2)!;
    expect(p2.kind).toBe('excluded');
    expect(p2.sourcePage).toBeNull();
    expect(r.excludedSourcePages).toEqual([2]);
    expect(r.contentPageCount).toBe(7);
  });
});

describe('补白位置（11 页）', () => {
  const r = impose(11, new Set(), 'short');
  it('补白位置 12 落在外帖正面左（封底位）', () => {
    const s0la = r.sheets[0].front.find((p) => p.key === 'LA')!;
    expect(s0la.position).toBe(12);
    expect(s0la.page.kind).toBe('blank');
  });
  it('完整外帖正面 12(补白) | 1', () => {
    expect(r.sheets[0].front.map((p) => [p.position, p.page.kind])).toEqual([
      [12, 'blank'],
      [1, 'content'],
    ]);
  });
});

describe('面板表完整性', () => {
  it('每个位置在拼版中恰好出现一次', () => {
    for (const n of [4, 8, 12, 16]) {
      const rows = saddleSequence(n);
      const positions = rows.map((r) => r.position).sort((a, b) => a - b);
      expect(positions).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });
});
