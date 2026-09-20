/** External credentials are checked by the supplier route on the shipped dsh Web profile. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { supplierFixture } from './supplier-fixture.mjs'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('supplier workspace edits, confirms, matches, shares and follows up through the real browser', { timeout: 120000 }, async t => {
  const parent = join(root, '.trade-runtime')
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'supplier-api-'))
  let child
  let browser
  t.after(async () => {
    await browser?.close()
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  const token = 'supplier-test-token-000000000000000000000000'
  const patch = join(directory, 'override.yml')
  await writeFile(patch, JSON.stringify([{ id: 'trade-enterprise', config: {
    directory: join(directory, 'data'), externalAgentToken: token, externalSupplierRecords: [], externalDocumentIds: [],
    maxFileBytes: 1048576, maxTotalBytes: 2097152, maxExtractedCharacters: 10000,
    knowledgeChunkCharacters: 512, maxKnowledgeResults: 5, maxDecompressedBytes: 1048576,
    maxArchiveEntries: 100, maxTableCells: 1000,
  } }]))
  child = spawn(process.execPath, [join(root, 'apps/cli/lib/bin.js'), '--profile', 'trade', '--from-default-profile', 'web', '--patch', join(root, 'trade/cordis.patch.yml'), '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: root, windowsHide: true, env: { ...process.env, DSH_HOME: join(directory, 'home') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stderr.on('data', value => { logs += value })
  const loginUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dsh startup timed out: ${logs}`)), 30000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`dsh exited ${code}: ${logs}`)) })
    child.stdout.on('data', value => {
      logs += value
      const match = logs.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
  })
  const origin = new URL(loginUrl).origin
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(loginUrl)
  await page.addLocatorHandler(page.getByRole('dialog', { name: '内测声明' }), async dialog => { await dialog.getByRole('button', { name: '继续' }).click() })
  await page.addLocatorHandler(page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }), async dialog => { await dialog.getByRole('button', { name: '稍后配置' }).click() })
  const welcome = page.getByRole('dialog', { name: '内测声明' })
  if (await welcome.count()) await welcome.getByRole('button', { name: '继续' }).click()
  const onboarding = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  if (await onboarding.count()) await onboarding.getByRole('button', { name: '稍后配置' }).click()
  const post = async (path, data) => {
    const response = await context.request.post(`${origin}/api/enterprise${path}`, { data })
    assert.equal(response.status(), 200, await response.text())
    return response.json()
  }
  await post('/profile', { name: '经纬面料', kind: 'enterprise', description: '为服装品牌提供定制印花粘胶面料。', business: '面料设计、打样和批量供应', website: '', contact: '', email: '', phone: '', address: '', logoId: null })
  const catalog = '100% viscose. 130 g/m². Custom printing for apparel brands. Commercial conditions need confirmation.'
  const upload = await context.request.post(`${origin}/api/enterprise/upload`, { headers: { 'x-file-name': 'catalog.txt' }, data: catalog })
  assert.equal(upload.status(), 201)
  const fileId = (await upload.json()).files[0].id
  const graph = supplierFixture(fileId)
  graph.nodes[0].claims = [{ ...graph.nodes[0].claims[0], qualification: '' }, { attribute: 'GSM', value: '130 g/m²', status: 'SELF_DECLARED', qualification: '', validUntil: null, evidenceIds: ['catalog'] }]
  graph.nodes[0].buyerTypes = ['服装品牌']; graph.nodes[0].markets = ['美国']; graph.nodes[0].businessModels = ['OEM']
  for (const [kind, title, summary] of [['offering', '印花粘胶面料', '面向服装品牌的定制面料系列'], ['value_proposition', '小品牌开发支持', '开发范围及数量按工艺确认'], ['case', '夏季连衣裙开发', '客户名称保密，项目结果需凭证核对'], ['partner_program', '海外分销合作', '区域、资格与独家条款待协商'], ['commercial_policy', '打样与交付政策', 'MOQ、交期、付款与物流按询价确认']]) graph.nodes.push({ id: kind, kind, title, summary, productRecordId: null, claims: [] })
  const id = crypto.randomUUID()
  await post('/supplier/draft', { id, expectedRevision: 0, fields: { kind: 'company', name: '经纬面料', description: '为服装品牌提供定制印花粘胶面料。', questions: '', sections: [{ label: '供给', content: 'Custom printed viscose', source: 'Catalog' }], supplier: graph } })
  await page.getByRole('button', { name: '企业空间', exact: true }).click({ timeout: 20000 })
  await page.getByRole('button', { name: '编辑采购档案', exact: true }).click()
  await page.locator('.supplier-editor').getByLabel('说明', { exact: true }).first().fill('Custom printed viscose for independent apparel brands.')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByRole('button', { name: '审阅并确认', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('我已阅读并确认本次内容').check()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '核对来源', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('我已阅读并确认本次内容').check()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText('已人工核对来源', { exact: false }).waitFor()
  await page.getByRole('button', { name: '读取原文', exact: true }).click()
  await page.getByRole('dialog').getByText(catalog, { exact: false }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  const output = join(root, '.trade-runtime', 'supplier-evidence')
  await mkdir(output, { recursive: true })
  await page.locator('.ent').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: join(output, 'profile-desktop.png') })
  await page.getByRole('button', { name: '采购匹配', exact: true }).click()
  await page.getByLabel('属性', { exact: true }).fill('克重')
  await page.getByLabel('数值要求', { exact: true }).check()
  await page.getByLabel('值（数值包含单位）', { exact: true }).fill('130')
  await page.getByLabel('单位', { exact: true }).fill('gsm')
  await page.getByRole('button', { name: '逐项匹配', exact: true }).click()
  await page.getByText('匹配', { exact: true }).waitFor()
  await page.locator('.supplier-card').filter({ has: page.getByText('匹配', { exact: true }) }).getByRole('button', { name: '发起采购请求' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('买家姓名').fill('采购测试')
  await dialog.getByLabel('买家邮箱').fill('buyer@example.com')
  await dialog.getByRole('button', { name: '保存请求草稿' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '确认提交', exact: true }).click()
  await page.getByRole('button', { name: '开始跟进', exact: true }).click()
  await page.getByText('跟进中', { exact: true }).waitFor()
  await page.getByRole('button', { name: '外部 Agent 接入', exact: true }).click()
  await page.getByLabel(/经纬面料 · 版本/).check()
  await page.getByLabel('catalog.txt', { exact: true }).check()
  await page.getByRole('button', { name: '保存共享范围' }).click()
  await page.getByRole('button', { name: '保存共享范围' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('.supplier-panel button:disabled'))
  const headers = { authorization: `Bearer ${token}` }
  const external = await (await fetch(`${origin}/supplier/v1/query`, { headers })).json()
  assert.equal(external.records[0].id, id)
  const asset = await fetch(`${origin}/supplier/v1/asset?id=${fileId}`, { headers: { ...headers, range: 'bytes=0-9' } })
  assert.equal(asset.status, 206)
  assert.equal(await asset.text(), catalog.slice(0, 10))
  const match = await fetch(`${origin}/supplier/v1/match`, { method: 'POST', headers, body: JSON.stringify({ recordId: id, requirements: [{ attribute: 'GSM', operator: 'equals', value: 130, unit: 'gsm' }] }) })
  assert.equal((await match.json()).candidates[0].status, 'MATCH')
  const inquiry = await fetch(`${origin}/supplier/v1/inquiries`, { method: 'POST', headers, body: JSON.stringify({ id: crypto.randomUUID(), recordId: id, recordRevision: external.records[0].revision, nodeIds: ['printing'], type: 'sample', name: 'API buyer', email: 'api@example.com', message: 'Please confirm sample conditions.' }) })
  assert.equal((await inquiry.json()).status, 'submitted')
  await page.getByLabel('catalog.txt', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存共享范围' }).click()
  await page.waitForFunction(() => !document.querySelector('.supplier-panel button:disabled'))
  assert.equal((await fetch(`${origin}/supplier/v1/asset?id=${fileId}`, { headers })).status, 404)
  await page.reload()
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByText('已人工核对来源', { exact: false }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.ent').getBoundingClientRect().x <= 57)
  await page.locator('.ent').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: join(output, 'profile-mobile.png') })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.deepEqual(errors, [])
})
