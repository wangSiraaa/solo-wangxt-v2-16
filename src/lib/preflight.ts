/**
 * 导出前检查（preflight）。导出按钮必须在无 error 时才可用。
 * 重点把“预览图 ≠ 最终 PDF”这条做成显式确认项。
 */
import type { ImpositionResult } from './imposition';
import type { LoadedPdf } from './pdfRender';
import { checkGeometry, type GeometryCheck, type ImpositionSettings } from './paper';

export interface PreflightItem {
  level: 'ok' | 'warn' | 'error';
  code: string;
  message: string;
}

export interface PreflightReport {
  items: PreflightItem[];
  hasError: boolean;
  hasWarn: boolean;
}

export function runPreflight(
  result: ImpositionResult,
  settings: ImpositionSettings,
  pdf: LoadedPdf | null,
  opts: { acknowledgedPreview: boolean },
): PreflightReport {
  const items: PreflightItem[] = [];
  const add = (level: PreflightItem['level'], code: string, message: string) =>
    items.push({ level, code, message });

  // 1) 源文件
  if (!pdf) {
    add('error', 'no-source', '尚未导入源 PDF，无法导出最终文件。');
  } else {
    add('ok', 'source', `已载入源 PDF：${pdf.pageCount} 页，导出将基于原始矢量页面重新拼版。`);
    const excluded = result.pages.filter((p) => p.kind === 'excluded').length;
    if (excluded > 0) add('ok', 'excluded', `已排除 ${excluded} 个原页（位置保留但不绘制内容，标记 EXCLUDED）。`);
  }

  // 2) 补白
  if (result.blankPositions.length > 0) {
    add('warn', 'blanks',
      `总页数非 4 的倍数，已在末尾补白 ${result.blankPositions.length} 页：位置 ${result.blankPositions.join(', ')}。请在预览中确认补白位置。`);
  } else {
    add('ok', 'blanks', '页数为 4 的倍数，无需补白。');
  }

  // 3) 封面单独计纸
  if (settings.coverSeparate) {
    add('ok', 'cover-separate', '封面帖单独计纸（1 张封面纸），内页另计。');
  } else {
    const coverText = result.sheetCount === 1
      ? '整本仅 1 张纸（封面即纸张）。'
      : `共 ${result.sheetCount} 张纸，封面帖与内页同纸（可在设置中改为封面单独计纸）。`;
    add('ok', 'cover-same', coverText);
  }

  // 4) 几何/出血/裁切
  const geo: GeometryCheck[] = checkGeometry(settings);
  for (const g of geo) add(g.level, g.code, g.message);
  if (geo.length === 0) add('ok', 'geometry', '出血、裁切与安全区参数检查通过。');

  // 5) 双面翻转
  add('ok', 'flip',
    result.flip === 'short'
      ? '短边翻转：背面无需旋转，翻页方向为左右翻（竖直书脊）。'
      : '长边翻转：背面两页已旋转 180°，请在“纸张正反面”视图确认背面方向。');

  // 6) 预览分辨率确认（防止拿截图去印刷）
  if (!opts.acknowledgedPreview) {
    add('error', 'preview-ack',
      '需要明确确认：屏幕预览为低分辨率位图，最终 PDF 由原始文件矢量重嵌生成，请勿使用截图印刷。');
  } else {
    add('ok', 'preview-ack', '已确认预览仅作检查，最终导出为高分辨率矢量 PDF。');
  }

  return {
    items,
    hasError: items.some((i) => i.level === 'error'),
    hasWarn: items.some((i) => i.level === 'warn'),
  };
}
