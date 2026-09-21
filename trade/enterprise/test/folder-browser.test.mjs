/** Real folder chooser and product editing through the shipped dsh Web profile. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { productFixture } from './geo-fixture.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('folder sources persist before onboarding and products support reviewed revisions on desktop and mobile', { timeout: 120000 }, async t => {
  await mkdir(join(root, '.trade-runtime'), { recursive: true })
  const directory = await mkdtemp(join(root, '.trade-runtime', 'folder-ui-'))
  const evidence = await mkdtemp(join(root, '.trade-runtime', 'folder-evidence-'))
  let child, browser
  t.after(async () => {
    try { await browser?.close() }
    finally {
      if (child && child.exitCode === null && child.signalCode === null) { const exit = once(child, 'exit'); child.kill(); await exit }
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
  const material = join(directory, 'Acme'), products = join(material, 'Products')
  await mkdir(products, { recursive: true })
  await writeFile(join(material, 'company.txt'), 'Acme manufactures steel components for equipment makers.')
  await writeFile(join(products, 'AX-1.txt'), 'AX-1 is a steel fitting. MOQ is 100 pieces, subject to final quotation.')
  await writeFile(join(products, 'AX-1.png'), await readFile(new URL('./fixtures/ocr-catalog.png', import.meta.url)))
  await writeFile(join(material, '.env'), 'SYNTHETIC_SECRET=excluded')
  await writeFile(join(material, 'legacy.bin'), 'unsupported source')
  const patch = join(directory, 'override.yml')
  await writeFile(patch, JSON.stringify([{ id: 'trade-enterprise', config: { directory: join(directory, 'data'), ...(process.env.DSH_ENTERPRISE_OCR_LANG_PATH ? { ocr: { langPath: process.env.DSH_ENTERPRISE_OCR_LANG_PATH } } : {}), maxFileBytes: 1048576, maxTotalBytes: 10485760, maxExtractedCharacters: 1000000, knowledgeChunkCharacters: 1200, maxKnowledgeResults: 8, maxDecompressedBytes: 134217728, maxArchiveEntries: 5000, maxTableCells: 250000 } }]))
  child = spawn(process.execPath, [join(root, 'apps/cli/lib/bin.js'), '--profile', 'trade', '--from-default-profile', 'web', '--patch', join(root, 'trade/cordis.patch.yml'), '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'], { cwd: directory, windowsHide: true, env: { ...process.env, DSH_HOME: join(directory, 'home'), DEEPSEEK_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stderr.on('data', data => { logs += data })
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Web startup timed out: ' + logs)), 30000)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Web exited ${code}: ${logs}`)) })
    child.stdout.on('data', data => { logs += data; const match = logs.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
  })
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addLocatorHandler(page.getByRole('dialog', { name: '内测声明' }), async dialog => { await dialog.getByRole('button', { name: '继续' }).click() })
  await page.addLocatorHandler(page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }), async dialog => { await dialog.getByRole('button', { name: '稍后配置' }).click() })
  await page.goto(url)
  await page.getByRole('heading', { name: '从企业资料文件夹建档' }).waitFor({ timeout: 20000 })
  let loseImportResponse = true
  await page.route('**/api/enterprise/sources/import', async route => {
    if (!loseImportResponse) { await route.continue(); return }
    loseImportResponse = false
    await route.fetch()
    await route.abort('failed')
  })
  await page.locator('.ent-source-panel input[type=file]').setInputFiles(material)
  await page.getByRole('button', { name: '导入所选资料', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '操作失败，请重试。' }).first().waitFor()
  await page.locator('.ent-source-selection').getByText('Acme/company.txt', { exact: true }).waitFor()
  await page.getByRole('button', { name: '导入所选资料', exact: true }).click()
  await page.getByRole('button', { name: '读取资料并建档', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.ent-source-panel button[disabled]'))
  const api = async () => (await context.request.get(new URL('/api/enterprise', url).href)).json()
  const stored = await api()
  assert.equal(stored.profile, null)
  assert.equal(stored.imports.length, 1)
  assert.equal(stored.files.length, 3)
  assert.equal(stored.imports[0].files.filter(file => file.status === 'skipped').length, 2)
  assert.equal(stored.files.filter(file => file.knowledgeStatus === 'ready').length, 2)
  assert.ok(stored.files.some(file => file.source.path === 'Acme/Products/AX-1.txt'))
  await page.getByText('资料共 5 份：已保存 3，等待上传 0，上传失败 0，已跳过 2。', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Acme/Products/AX-1.txt', { exact: true }).waitFor()
  if (process.env.DSH_ENTERPRISE_OCR_LANG_PATH) {
    await page.getByRole('button', { name: '识别图片 / 扫描件', exact: true }).click()
    await page.getByRole('button', { name: '核对识别文字', exact: true }).waitFor()
    await page.getByRole('button', { name: '核对识别文字', exact: true }).click()
    await page.locator('.ent-ocr-review pre').getByText('ACME PRODUCT AX-1', { exact: false }).waitFor()
    await page.getByRole('button', { name: '文字与原件一致，确认核对', exact: true }).click()
    await page.getByText('OCR 文字已人工核对', { exact: true }).waitFor()
    await page.screenshot({ path: join(evidence, 'ocr-review.png'), fullPage: true })
    await page.reload()
    await page.getByText('OCR 文字已人工核对', { exact: true }).waitFor()
    assert.ok((await api()).files.find(file => file.name === 'AX-1.png').ocr.reviewedAt)
  }
  await page.screenshot({ path: join(evidence, 'folder-desktop.png'), fullPage: true })
  const onboardingId = (await api()).onboarding.sessionId
  await page.getByRole('button', { name: '读取资料并建档', exact: true }).click()
  await page.locator('.ent').waitFor({ state: 'hidden' })
  await page.getByText('请根据已导入的企业资料文件夹完成企业和产品建档。', { exact: false }).first().waitFor()
  assert.equal((await api()).onboarding.sessionId, onboardingId)
  // Product UI coverage starts with a saved company; Agent confirmation is covered by Host and Session tests.
  assert.equal((await context.request.post(new URL('/api/enterprise/profile', url).href, { data: { name: 'Acme', kind: 'enterprise', description: 'Steel components', business: '', website: '', contact: '', email: '', phone: '', address: '', logoId: null } })).status(), 200)
  await page.reload()
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByRole('tab', { name: '产品中心', exact: true }).click()
  await page.getByRole('button', { name: '新增产品', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '新增产品', exact: true })
  await dialog.getByLabel('产品名称', { exact: true }).fill('AX-1')
  await dialog.getByLabel('产品介绍', { exact: true }).fill('Steel fitting for equipment makers')
  await dialog.getByRole('button', { name: '添加信息项', exact: true }).click()
  await dialog.getByLabel('信息名称', { exact: true }).fill('Material')
  await dialog.getByLabel('内容', { exact: true }).fill('Steel')
  await dialog.getByLabel('依据或来源', { exact: true }).fill('Uploaded AX-1 catalog')
  await dialog.getByRole('checkbox', { name: 'Acme/Products/AX-1.txt', exact: true }).check()
  await dialog.getByRole('checkbox', { name: 'Acme/Products/AX-1.png', exact: true }).check()
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: 'AX-1', exact: true }).waitFor()
  await page.getByRole('button', { name: '审阅并确认', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('article').getByText('已确认', { exact: true }).waitFor()
  await page.getByRole('button', { name: '编辑产品', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '编辑产品', exact: true })
  await dialog.getByLabel('产品介绍', { exact: true }).fill('Revised fitting description')
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const revised = await api()
  assert.equal(revised.geo.length, 2)
  assert.equal(revised.geo.find(record => record.status === 'confirmed').description, 'Steel fitting for equipment makers')
  assert.equal(revised.geo.find(record => record.status === 'draft').assetIds.length, 2)
  await page.getByRole('button', { name: '归档产品', exact: true }).click()
  await page.getByRole('combobox', { name: '产品中心', exact: true }).selectOption('archived')
  await page.getByRole('button', { name: '恢复产品', exact: true }).click()
  await page.getByRole('combobox', { name: '产品中心', exact: true }).selectOption('all')
  await page.getByRole('heading', { name: 'AX-1', exact: true }).waitFor()
  const current = (await api()).geo.find(record => record.status === 'draft')
  const product = productFixture()
  product.offers = [{ id: 'Sample offer', seller: product.identity.manufacturer, claimIds: ['weight'], currency: 'USD', unit: 'm', regions: ['US'], validUntil: '2027-01-01T00:00:00Z' }]
  assert.equal((await context.request.post(new URL('/api/enterprise/products/draft', url).href, { data: { id: current.id, expectedRevision: current.revision, supersedesId: current.supersedesId, fields: { kind: 'product', name: current.name, description: current.description, sections: current.sections, questions: '', assetIds: current.assetIds, product } } })).status(), 200)
  await page.reload()
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByRole('tab', { name: '产品中心', exact: true }).click()
  await page.getByRole('button', { name: '审阅并确认', exact: true }).click()
  const review = page.getByRole('dialog', { name: '确认这份产品档案', exact: true })
  await review.locator('summary').click()
  await review.getByText('Sample offer · USD / m', { exact: true }).waitFor()
  await review.getByText('Indoor apparel', { exact: true }).waitFor()
  await review.getByText('Page 4, item R-821', { exact: false }).waitFor()
  await review.getByRole('button', { name: '关闭', exact: true }).click()
  await page.screenshot({ path: join(evidence, 'products-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.ent').getBoundingClientRect().x <= 57)
  await page.screenshot({ path: join(evidence, 'products-mobile.png'), fullPage: true })
  assert.equal(await page.locator('.ent-products').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  assert.deepEqual(errors, [])
  t.diagnostic(`Screenshots: ${evidence}`)
})
