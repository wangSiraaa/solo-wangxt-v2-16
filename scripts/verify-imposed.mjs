/**
 * 端到端验证：生成样册 -> 真实导出拼版 PDF -> 解析输出页，断言：
 *  - 输出页数 = 纸张数 × 2（正/反）
 *  - 尺寸为横向展开尺寸
 *  - 每张纸正反两面的源页引用与 imposition 页序一致
 *  - 长边翻转时背面绘制包含 180° 旋转矩阵；短边不含
 *  - 11 页样本补白页位置正确（无源页 XObject，有 BLANK 标记）
 */
import { build as esbuild } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// 用 esbuild 把 TS 源码 + 依赖打包成 node CJS，避免在脚本里处理 TS/worker
async function loadModules() {
  const result = await esbuild({
    stdin: {
      contents: `
export { makeSamplePdf } from './src/lib/sample.ts';
export { buildBookletPdf } from './src/lib/export.ts';
export { impose } from './src/lib/imposition.ts';
export { DEFAULT_SETTINGS } from './src/lib/paper.ts';
      `,
      resolveDir: resolve('.'),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  const m = mod.exports;
  // esbuild CJS 互操作：命名导出可能挂在 default 上
  return m.default && m.default.makeSamplePdf ? m.default : m;
}

// pdf.js legacy node build（无 canvas 也能 getOperatorList）
async function loadPdfJs() {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return mod.default ?? mod;
}

const OPS = {
  // 我们关心的算子
};

async function analyze(bytes, pdfjs) {
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    const vp = page.getViewport({ scale: 1 });
    // 收集嵌入表单 XObject（pdf.js 内联为 paintFormXObjectBegin/End）
    const formBegins = [];
    // 严格图形状态栈（q/Q + cm），用于计算每个源页的物理落点与朝向
    const st = [[1, 0, 0, 1, 0, 0]];
    const mm = (A, B) => [
      B[0] * A[0] + B[2] * A[1], B[1] * A[0] + B[3] * A[1],
      B[0] * A[2] + B[2] * A[3], B[1] * A[2] + B[3] * A[3],
      B[0] * A[4] + B[2] * A[5] + B[4], B[1] * A[4] + B[3] * A[5] + B[5],
    ];
    const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k];
      const args = ops.argsArray[k];
      if (fn === pdfjs.OPS.save) st.push(st[st.length - 1]);
      else if (fn === pdfjs.OPS.restore) { if (st.length > 1) st.pop(); }
      else if (fn === pdfjs.OPS.transform) st[st.length - 1] = mm(st[st.length - 1], args);
      // paintFormXObjectBegin: args = [matrix[a,b,c,d,e,f], bbox]
      else if (fn === 74) {
        formBegins.push({ matrix: args[0], bbox: args[1] });
        // 页面点 = drawPage(top) × 嵌入矩阵(args[0]) × 表单局部点
        const total = mm(args[0], st[st.length - 1]);
        const bb = args[1];
        const w = bb[2] - bb[0];
        const h = bb[3] - bb[1];
        const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => ap(total, x, y));
        formBegins[formBegins.length - 1].cx = corners.reduce((s, q) => s + q[0], 0) / 4;
        formBegins[formBegins.length - 1].upVy = ap(total, w / 2, h)[1] - ap(total, w / 2, 0)[1];
      }
    }
    pages.push({ width: vp.width, height: vp.height, formBegins });
  }
  return { pageCount: doc.numPages, pages };
}

function has180(formBegins) {
  // 180° 预置嵌入矩阵 [-1,0,0,-1,w,h]
  return formBegins.some((f) => Math.abs(f.matrix[0] + 1) < 1e-3 && Math.abs(f.matrix[3] + 1) < 1e-3);
}

// 面板名半张 -> 物理半张（与 src/lib/imposition.ts physicalHalf 保持一致）
function physicalHalf(p) {
  return p.side === 'front' ? p.half : p.half === 'L' ? 'R' : 'L';
}

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗', msg); failures++; }
}

async function runCase(pageCount, flip, M, pdfjs) {
  console.log(`\n== ${pageCount} 页样本，${flip === 'short' ? '短边' : '长边'}翻转 ==`);
  const sourceBytes = await M.makeSamplePdf(pageCount);
  const result = M.impose(pageCount, new Set(), flip);
  const settings = { ...M.DEFAULT_SETTINGS, flip, drawMarks: true };
  settings.trim = { ...M.DEFAULT_SETTINGS.trim, drawMarks: true };
  const out = await M.buildBookletPdf({ sourceBytes, result, settings, markBlanks: true });

  const analyzed = await analyze(out.slice(), pdfjs);
  const expectedSheets = Math.ceil(pageCount / 4);
  assert(analyzed.pageCount === expectedSheets * 2,
    `输出 PDF 页数 ${analyzed.pageCount} = 纸张 ${expectedSheets} × 2（正反）`);

  // A3 展开尺寸 420×297mm -> pt
  const expectedW = 420 * 2.834645669;
  const expectedH = 297 * 2.834645669;
  for (let i = 0; i < analyzed.pages.length; i++) {
    const p = analyzed.pages[i];
    assert(Math.abs(p.width - expectedW) < 1 && Math.abs(p.height - expectedH) < 1,
      `输出页 ${i + 1} 为横向 A3 展开尺寸 (${p.width.toFixed(0)}×${p.height.toFixed(0)}pt)`);
  }

  // 每张纸：front = 输出页 2k，back = 2k+1（0 基）
  for (let k = 0; k < expectedSheets; k++) {
    const front = analyzed.pages[2 * k];
    const back = analyzed.pages[2 * k + 1];
    // 源页绘制数量：内容页才会有 form xobject；补白/排除无
    const sheetResult = result.sheets[k];
    const expectedFrontContent = sheetResult.front.filter((p) => p.page.kind === 'content').length;
    const expectedBackContent = sheetResult.back.filter((p) => p.page.kind === 'content').length;
    assert(front.formBegins.length === expectedFrontContent,
      `第 ${k + 1} 张正面绘制 ${front.formBegins.length} 个源页（期望 ${expectedFrontContent}）：位置 ${sheetResult.front.map((p) => p.position).join('|')}`);
    assert(back.formBegins.length === expectedBackContent,
      `第 ${k + 1} 张背面绘制 ${back.formBegins.length} 个源页（期望 ${expectedBackContent}）：位置 ${sheetResult.back.map((p) => p.position).join('|')}`);

    if (flip === 'long') {
      assert(has180(back.formBegins), `长边翻转：第 ${k + 1} 张背面包含 180° 旋转矩阵`);
    } else {
      assert(!has180(back.formBegins), `短边翻转：第 ${k + 1} 张背面不含 180° 旋转`);
    }
    assert(!has180(front.formBegins), `第 ${k + 1} 张正面不含 180° 旋转`);

    // 逐面板核对：物理半张（背面镜像）+ 朝向（长边背面倒置）
    const halfWpt = expectedW / 2;
    for (const [side, analyzedPage, panels] of [['front', front, sheetResult.front], ['back', back, sheetResult.back]]) {
      const cps = panels.filter((p) => p.page.kind === 'content');
      cps.forEach((p, i) => {
        const f = analyzedPage.formBegins[i];
        const expHalf = physicalHalf(p);
        const inHalf = expHalf === 'L' ? f.cx < halfWpt - 1 : f.cx > halfWpt + 1;
        assert(inHalf,
          `第 ${k + 1} 张${side === 'front' ? '正面' : '背面'} 位置${p.position} 落在纸${expHalf === 'L' ? '左' : '右'}半张`);
        const wantUp = flip === 'long' && side === 'back' ? -1 : 1;
        assert(Math.sign(f.upVy) === wantUp,
          `第 ${k + 1} 张${side === 'front' ? '正面' : '背面'} 位置${p.position} 朝向=${Math.sign(f.upVy)}（期望 ${wantUp}）`);
      });
    }
  }

  // 保存供肉眼检查
  mkdirSync('test-output', { recursive: true });
  const fname = `test-output/sample-${pageCount}p-${flip}.pdf`;
  writeFileSync(fname, out);
  console.log('  → 已写出', fname);
  return { result, out };
}

async function main() {
  const M = await loadModules();
  const pdfjs = await loadPdfJs();

  await runCase(8, 'short', M, pdfjs);
  await runCase(8, 'long', M, pdfjs);
  const r11 = await runCase(11, 'short', M, pdfjs);
  await runCase(11, 'long', M, pdfjs);

  // 11 页补白具体位置断言
  console.log('\n== 11 页补白位置 ==');
  const blanks = r11.result.blankPositions;
  assert(JSON.stringify(blanks) === '[12]', `补白位置为 ${JSON.stringify(blanks)}（仅位置 12）`);
  const la = r11.result.sheets[0].front[0];
  assert(la.position === 12 && la.page.kind === 'blank', '补白落在最外帖正面左（封底位 LA=12）');
  // 位置 12 之前的真实页 11 在内帖
  const p11panel = r11.result.sheets.flatMap((s) => [...s.front, ...s.back]).find((p) => p.page.sourcePage === 11);
  assert(p11panel && p11panel.key === 'LB' && p11panel.half === 'L', '源第 11 页位于内帖（位置 11，LB）');

  console.log(failures === 0 ? '\n全部端到端断言通过 ✅' : `\n${failures} 条断言失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
