// 在 ESM 脚本中拿到 pdf.js legacy（node 端解析下载的 PDF）
export async function pdfjsLegacy() {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return mod.default ?? mod;
}
