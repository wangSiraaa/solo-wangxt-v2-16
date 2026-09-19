/* 端到端冒烟：样册加载 → 拼版预览 → 导出下载 → 刷新恢复 */
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs'

const BASE = 'http://localhost:4173/'
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)

// 1. 载入 11 页样册
await page.getByRole('button', { name: '载入 11 页样册' }).click()
await page.waitForSelector('text=共 3 张纸', { timeout: 15000 })
console.log('✓ 11 页样册拼版为 3 张纸')

// 2. 补白标注可见
await page.waitForSelector('text=补白', { timeout: 5000 })
console.log('✓ 补白位置已展示')

// 3. 导出前检查出现补白警告
await page.waitForSelector('text=存在补白页')
console.log('✓ 导出前检查提示补白')

// 4. 切换短边翻转，背面应标注倒置
await page.getByText('短边翻转（背面倒置）').click()
await page.waitForSelector('text=短边翻转 · 背面倒置 180°')
console.log('✓ 短边翻转背面倒置标注出现')

// 5. 导出并保存下载文件
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.getByRole('button', { name: '导出拼版 PDF' }).click(),
])
const path = '/tmp/e2e-export.pdf'
await download.saveAs(path)
const doc = await PDFDocument.load(fs.readFileSync(path))
console.log(`✓ 导出成功：${doc.getPageCount()} 面（预期 6）`)
if (doc.getPageCount() !== 6) throw new Error('导出页数不符')

// 6. 刷新后从 IndexedDB 恢复
await page.reload()
await page.waitForSelector('text=样册-11页.pdf', { timeout: 15000 })
await page.waitForSelector('text=共 3 张纸', { timeout: 15000 })
console.log('✓ 刷新后工程从 IndexedDB 恢复')

// 7. 撤销：排除一页再撤销
await page.waitForSelector('text=原始页面')
const cells = page.locator('.grid .cell')
await cells.nth(4).click()
await page.waitForSelector('text=已排除')
await page.getByRole('button', { name: '撤销调整' }).click()
await page.waitForSelector('text=共 3 张纸')
console.log('✓ 排除页与撤销正常')

if (errors.length) throw new Error('页面报错：' + errors.join('; '))
await browser.close()
console.log('E2E 全部通过')
