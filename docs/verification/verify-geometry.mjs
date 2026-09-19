// 几何断言：严格按 q/Q 与 FORM begin/end 维护变换栈，
// 计算每个嵌入源页中心落点（左/右半张）与朝向。
import { build as esbuild } from 'esbuild';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const pdfjsMod = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfjs = pdfjsMod.default ?? pdfjsMod;

const result = await esbuild({
  stdin: { contents: `export {makeSamplePdf} from './src/lib/sample.ts';
export {buildBookletPdf} from './src/lib/export.ts';
export {impose} from './src/lib/imposition.ts';
export {DEFAULT_SETTINGS} from './src/lib/paper.ts';`,
  resolveDir: resolve(process.cwd()), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
const M = mod.exports.default ?? mod.exports;

// 列主序 [a,b,c,d,e,f]；先 A 后 B => B*A
const mm = (A, B) => [
  B[0] * A[0] + B[2] * A[1], B[1] * A[0] + B[3] * A[1],
  B[0] * A[2] + B[2] * A[3], B[1] * A[2] + B[3] * A[3],
  B[0] * A[4] + B[2] * A[5] + B[4], B[1] * A[4] + B[3] * A[5] + B[5],
];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const ID = [1, 0, 0, 1, 0, 0];

async function pageForms(bytes, pageNum) {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(pageNum);
  const ops = await page.getOperatorList();
  // 当前变换 = 自底向上矩阵列表（外层在前）；FORM begin 时记录截断点
  // 严格图形状态栈：q 压入当前 CTM 副本，Q 弹出；cm 修改栈顶。
  // FORM begin 时栈顶即包含 drawPage 的 translate+scale；FORM 内部算子由 pdf.js
  // 用其自身的 q/Q 配对包裹，天然不污染。
  const st = [ID];
  const forms = [];
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    const a = ops.argsArray[k];
    if (fn === pdfjs.OPS.save) {
      st.push(st[st.length - 1]);
    } else if (fn === pdfjs.OPS.restore) {
      if (st.length > 1) st.pop();
    } else if (fn === pdfjs.OPS.transform) {
      st[st.length - 1] = mm(st[st.length - 1], a);
    } else if (fn === pdfjs.OPS.paintFormXObjectBegin) {
      // 页面点 = top(drawPage 定位+缩放) × arg0(表单内置旋转，180 时为 [-1,0,0,-1,w,h]) × 表单局部点。
      // mm(A,B)=B*A 表示“先 A 后 B”，所以 total = mm(arg0, top)。
      const total = mm(a[0], st[st.length - 1]);
      const bbox = a[1];
      const w = bbox[2] - bbox[0];
      const h = bbox[3] - bbox[1];
      // 四个局部角点，覆盖旋转后仍取真实质心
      const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => ap(total, x, y));
      const cx = pts.reduce((s, q) => s + q[0], 0) / 4;
      const up = ap(total, w / 2, h);
      const lo = ap(total, w / 2, 0);
      forms.push({ upVy: up[1] - lo[1], cx });
    }
  }
  return forms;
}

const SHEET_W = 420 * 2.834645669;
let fail = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };

for (const flip of ['short', 'long']) {
  for (const npc of [8, 11]) {
    console.log(`\n== ${npc}页 ${flip} ==`);
    const src = await M.makeSamplePdf(npc);
    const imp = M.impose(npc, new Set(), flip);
    const settings = { ...M.DEFAULT_SETTINGS, flip, trim: { ...M.DEFAULT_SETTINGS.trim, drawMarks: false } };
    const out = await M.buildBookletPdf({ sourceBytes: src, result: imp, settings, markBlanks: false });
    for (let k = 0; k < imp.sheetCount; k++) {
      for (const [side, pno, panels] of [['front', 2 * k + 1, imp.sheets[k].front], ['back', 2 * k + 2, imp.sheets[k].back]]) {
        const forms = await pageForms(out.slice(), pno);
        const cps = panels.filter((p) => p.page.kind === 'content');
        if (forms.length !== cps.length) ok(false, `sheet${k + 1} ${side} 面版数 ${forms.length}≠${cps.length}`);
        forms.forEach((f, i) => {
          const p = cps[i];
          const expHalf = side==='front' ? p.half : (p.half==='L'?'R':'L');
          const inHalf = expHalf === 'L' ? f.cx < SHEET_W / 2 - 1 : f.cx > SHEET_W / 2 + 1;
          const wantUp = flip === 'long' && side === 'back' ? -1 : 1;
          ok(inHalf, `位置${p.position}(${side}) 落${expHalf === 'L' ? '左' : '右'}半张 cx=${f.cx.toFixed(0)}`);
          ok(Math.sign(f.upVy) === wantUp, `位置${p.position}(${side}) 朝向=${Math.sign(f.upVy)} 期望${wantUp}`);
        });
      }
    }
  }
}
console.log(fail ? `\n${fail} 失败 ❌` : '\n几何全部正确 ✅');
process.exit(fail ? 1 : 0);
