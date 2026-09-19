/**
 * 浏览器真实环境冒烟测试（Playwright + Chromium）：
 *  - PDF.js worker 能渲染原页缩略图
 *  - 切换长/短边翻转后背面方向不同
 *  - 排除页、撤销恢复
 *  - 导出前检查：未确认“预览≠最终稿”时禁止下载
 *  - 真实点击下载，校验落盘 PDF 页数、尺寸、180° 矩阵与预览设置一致
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { pdfjsLegacy } from './pdfjs-helper.mjs';
import { rmSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const PORT = 5219;
let browser, page, server;

async function boot() {
  server = await createServer({ server: { port: PORT }, logLevel: 'silent' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ acceptDownloads: true });
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}`);
  return errors;
}

async function loadSample(n) {
  await page.getByRole('button', { name: new RegExp(`载入 ${n} 页样册`) }).click();
  await page.waitForSelector('.thumb img', { timeout: 20000 });
  await page.waitForTimeout(1200); // 让缩略图多渲染几张
}

async function analyzePdf(bytes, pdfjs) {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const ops = await pg.getOperatorList();
    const vp = pg.getViewport({ scale: 1 });
    let forms = 0;
    let has180 = false;
    for (let k = 0; k < ops.fnArray.length; k++) {
      if (ops.fnArray[k] === 74) {
        forms++;
        const m = ops.argsArray[k][0];
        if (Math.abs(m[0] + 1) < 1e-3 && Math.abs(m[3] + 1) < 1e-3) has180 = true;
      }
    }
    pages.push({ forms, has180, w: vp.width, h: vp.height });
  }
  return { count: doc.numPages, pages };
}

async function exportAndAnalyze(flip, expectedSheets, pdfjs) {
  // 确认“预览≠最终稿”
  await page.getByText(/我已知晓/).locator('input').check();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /下载最终拼版 PDF/ }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = []
  for await (const c of stream) chunks.push(c);
  const bytes = new Uint8Array(Buffer.concat(chunks));
  const analyzed = await analyzePdf(bytes, pdfjs);
  assert.equal(analyzed.count, expectedSheets * 2, `${flip}: PDF 页数应为 ${expectedSheets * 2}`);
  for (let k = 0; k < expectedSheets; k++) {
    const front = analyzed.pages[2 * k];
    const back = analyzed.pages[2 * k + 1];
    assert.equal(front.has180, false, `${flip}: 正面不应有 180°`);
    if (flip === 'long') assert.equal(back.has180, true, '长边背面应有 180°');
    else assert.equal(back.has180, false, '短边背面不应有 180°');
  }
  return analyzed;
}

async function main() {
  const errors = await boot();
  const pdfjs = await pdfjsLegacy();

  // 1) 8 页样册
  await loadSample(8);
  let imgCount = await page.locator('.thumb img').count();
  assert.ok(imgCount >= 6, `缩略图应已渲染多张，实际 ${imgCount}`);
  assert.ok((await page.locator('.sheet').count()) >= 4, '应渲染 2 张纸 × 正反面');

  // 2) 短边背面无 180 徽章；切到长边后出现
  assert.equal((await page.locator('.rot-badge').count()), 0, '短边初始不应有旋转徽章');
  await page.getByRole('button', { name: '长边翻转' }).click();
  await page.waitForSelector('.rot-badge');
  const badges = await page.locator('.rot-badge').count();
  assert.ok(badges >= 2, `长边背面应有旋转徽章，实际 ${badges}`);
  await page.getByRole('button', { name: '短边翻转' }).click();

  // 3) 导出按钮在确认前禁用
  const btn = page.getByRole('button', { name: /下载最终拼版 PDF/ });
  assert.ok(await btn.isDisabled(), '未确认预览声明时导出应禁用');

  // 4) 排除第 2 页 + 撤销
  const before = await page.locator('.thumb.excluded').count();
  await page.locator('.thumb').nth(1).click();
  assert.equal(await page.locator('.thumb.excluded').count(), before + 1, '排除后应出现 excluded 样式');
  await page.getByRole('button', { name: '撤销调整' }).click();
  assert.equal(await page.locator('.thumb.excluded').count(), before, '撤销后应恢复');

  // 5) 8 页短边下载
  const a8s = await exportAndAnalyze('short', 2, pdfjs);
  assert.ok(Math.abs(a8s.pages[0].w - 1190.55) < 2 && Math.abs(a8s.pages[0].h - 841.89) < 2, 'A3 展开尺寸');

  // 6) 11 页：补白横幅 + 3 张纸
  await page.getByRole('button', { name: '关闭文件' }).click().catch(() => {});
  await loadSample(11);
  await page.getByText(/已自动补白/).waitFor({ timeout: 5000 });
  const banner = await page.getByText(/位置 12/).textContent();
  assert.ok(banner && banner.includes('位置 12'), '11 页应明确提示补白位置 12');
  const a11 = await exportAndAnalyze('short', 3, pdfjs);
  // 第一张正面只有 1 个内容表单（位置12为补白）
  assert.equal(a11.pages[0].forms, 1, '11 页第一张正面只有 1 个内容页（另一为补白）');

  // 7) 长边 11 页
  await page.getByRole('button', { name: '长边翻转' }).click();
  // 需要重新勾选（切换文件后状态重置）——11 页刚导出时已勾选；flip 不重置
  const a11l = await exportAndAnalyze('long', 3, pdfjs);
  assert.equal(a11l.pages[1].has180, true, '长边 11 页背面有 180°');

  assert.equal(errors.filter((e) => !/favicon|pdfjs|Warning/.test(e)).length, 0,
    `不应有未处理的页面错误: ${errors.join(' | ')}`);

  console.log('浏览器端到端冒烟测试全部通过 ✅');
  await browser.close();
  await server.close();
}

main().catch(async (e) => {
  console.error(e);
  try { await page.screenshot({ path: 'test-output/browser-fail.png', fullPage: true }); } catch {}
  await browser?.close();
  await server?.close();
  process.exit(1);
});

void rmSync; void existsSync;
