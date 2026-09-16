/** Real dsh Web flow against isolated enterprise storage and an OS-assigned port. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { once } from 'node:events'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('native enterprise panel creates a profile and manages assets on desktop and mobile', { timeout: 120000 }, async t => {
  await mkdir(join(root, '.trade-runtime'), { recursive: true })
  const directory = await mkdtemp(join(root, '.trade-runtime', 'enterprise-ui-'))
  const output = join(root, '.trade-runtime', 'enterprise-evidence')
  await mkdir(output, { recursive: true })
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
  const patch = join(directory, 'override.yml')
  await writeFile(patch, JSON.stringify([{ id: 'trade-enterprise', config: {
    directory: join(directory, 'data'), maxFileBytes: 268435456, maxTotalBytes: 2147483648,
    maxExtractedCharacters: 1000000, knowledgeChunkCharacters: 1200, maxKnowledgeResults: 8,
    maxDecompressedBytes: 134217728, maxArchiveEntries: 5000, maxTableCells: 250000,
  } }]))
  const cliArgs = [join(root, 'apps/cli/lib/bin.js'), '--profile', 'trade']
  if (!existsSync(join(root, '.trade-runtime', 'profiles', 'trade', 'package.json'))) cliArgs.push('--from-default-profile', 'web')
  cliArgs.push('--patch', join(root, 'trade/cordis.patch.yml'), '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open')
  child = spawn(process.execPath, cliArgs, {
    cwd: root, windowsHide: true, env: { ...process.env, DSH_HOME: join(root, '.trade-runtime') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stderr.on('data', value => { logs += value })
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('dsh startup timed out: ' + logs)), 30000)
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('exit', code => { clearTimeout(timeout); reject(new Error(`dsh exited ${code}: ${logs}`)) })
    child.stdout.on('data', value => {
      logs += value
      const match = logs.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
  })
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.waitForTimeout(500)
  const welcome = page.getByRole('dialog', { name: '内测声明' })
  if (await welcome.count()) await welcome.getByRole('button', { name: '继续' }).click()
  const modelOnboarding = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  if (await modelOnboarding.count()) await modelOnboarding.getByRole('button', { name: '稍后配置' }).click()
  await page.getByRole('button', { name: '企业空间', exact: true }).click({ timeout: 20000 })
  await page.getByRole('button', { name: '开始产品 GEO', exact: true }).waitFor()
  assert.equal(await page.locator('.ent input:not([type=file]), .ent textarea, .ent select').count(), 0)
  assert.equal(await page.locator('.ent button').count(), 1)
  await page.screenshot({ path: join(output, 'onboarding-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(output, 'onboarding-mobile.png') })
  await page.getByRole('button', { name: '开始产品 GEO', exact: true }).click({ force: true })
  await page.locator('.ent').waitFor({ state: 'hidden' })
  await page.getByText(/\/product-geo/).first().waitFor()
  await page.screenshot({ path: join(output, 'onboarding-chat.png') })
  const progressBefore = await (await context.request.get(new URL('/api/enterprise', url).href)).json()
  assert.ok(progressBefore.onboarding.sessionId)
  await page.reload()
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByRole('button', { name: /开始产品 GEO|继续产品 GEO/ }).click()
  await page.locator('.ent').waitFor({ state: 'hidden' })
  const progressAfter = await (await context.request.get(new URL('/api/enterprise', url).href)).json()
  assert.equal(progressAfter.onboarding.sessionId, progressBefore.onboarding.sessionId)
  assert.equal(progressAfter.onboarding.revision, progressBefore.onboarding.revision)
  // Asset coverage seeds its own profile; it does not represent model-driven onboarding.
  const seeded = await context.request.post(new URL('/api/enterprise/profile', url).href, { data: {
    name: '远帆贸易工作室', kind: 'studio', description: '面向海外市场的产品设计与供应服务。', business: '家居用品、产品定制、出口供应',
    website: '', contact: '测试联系人', email: '', phone: '', address: '', logoId: null,
  } })
  assert.equal(seeded.status(), 200)
  const opportunityId = crypto.randomUUID()
  const opportunity = await context.request.post(new URL('/api/enterprise/opportunities', url).href, { data: { action: 'create', id: opportunityId, fields: {
    buyerName: 'Nordhaus GmbH', buyerWebsite: 'https://buyer.example', country: '德国', targetProduct: '定制家居用品', contactName: '', contactRole: '', contactEmail: '', summary: '经营家居用品并展示定制采购目录。', matchScore: 78, matchRationale: '产品类别和目标市场匹配，仍需确认采购周期。', procurementSignals: ['公开目录包含定制家居用品'], evidence: [{ label: '买家产品目录', uri: 'https://buyer.example/catalog', note: '目录展示定制家居用品。', observedAt: '2026-09-16T10:00:00.000Z' }], status: 'qualified', nextAction: '确认采购负责人和下一采购周期。', lastContactAt: null,
  } } })
  assert.equal(opportunity.status(), 200)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByRole('heading', { name: '远帆贸易工作室' }).waitFor()
  await page.getByRole('tab', { name: '机会看板', exact: true }).click()
  await page.getByRole('heading', { name: 'Nordhaus GmbH' }).waitFor()
  await page.getByRole('button', { name: '查看详情' }).click()
  await page.getByRole('dialog').getByRole('link', { name: '买家产品目录' }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()
  await page.screenshot({ path: join(output, 'opportunities-desktop.png') })
  await page.getByRole('tab', { name: '企业档案', exact: true }).click()
  await page.getByText(/^已提交 · /).waitFor()
  await page.screenshot({ path: join(output, 'profile-desktop.png') })
  await page.getByRole('tab', { name: '企业资料' }).click()
  const png = await readFile(join(root, 'packages/skill/skill-badge/assets/dsh-badge.png'))
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320; canvas.height = 200
    const drawing = canvas.getContext('2d')
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const complete = new Promise(resolve => { recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))) })
    recorder.start()
    for (let frame = 0; frame < 8; frame++) {
      drawing.fillStyle = '#e3eef0'; drawing.fillRect(0, 0, 320, 200)
      drawing.fillStyle = '#286e74'; drawing.fillRect(frame * 25, 60, 60, 80)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    recorder.stop()
    for (const track of stream.getTracks()) track.stop()
    return complete
  })
  await page.locator('input[type=file]').first().setInputFiles([
    { name: '产品样图.png', mimeType: 'image/png', buffer: png },
    { name: '企业介绍.txt', mimeType: 'text/plain', buffer: Buffer.from('Company introduction and export services.') },
    { name: '产品视频.webm', mimeType: 'video/webm', buffer: Buffer.from(video) },
  ])
  await page.getByText('产品视频.webm', { exact: true }).waitFor()
  await page.getByText('AI 可检索', { exact: true }).waitFor()
  await page.getByRole('button', { name: '预览 产品样图.png', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const preview = dialog.getByRole('img', { name: '产品样图.png', exact: true })
  await preview.waitFor()
  assert.equal(await preview.evaluate(image => image.complete && image.naturalWidth > 0), true)
  await dialog.getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '预览 产品视频.webm', exact: true }).click()
  await page.getByRole('dialog').locator('video').evaluate(async video => { await video.play() })
  await page.waitForFunction(() => document.querySelector('.ent-preview')?.currentTime > 0)
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()
  const card = page.locator('article').filter({ hasText: '企业介绍.txt' })
  await card.getByRole('button', { name: '重命名' }).click()
  await page.getByRole('dialog').getByLabel('文件名称').fill('公司简介.txt')
  await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
  await page.getByText('公司简介.txt', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByRole('tab', { name: '企业资料' }).click()
  await page.getByText('公司简介.txt', { exact: true }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('.ent-thumb img')].every(image => image.complete && image.naturalWidth > 0))
  await page.screenshot({ path: join(output, 'assets-desktop.png') })
  await page.getByRole('tab', { name: 'AI 创作' }).click()
  await page.getByRole('button', { name: '生成公司介绍' }).waitFor()
  assert.match(await page.getByText(/份资料可供 AI 检索/).innerText(), /1 \/ 3/)
  await page.screenshot({ path: join(output, 'ai-desktop.png') })
  await page.getByRole('tab', { name: '企业资料' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.ent').getBoundingClientRect().x <= 57)
  await page.screenshot({ path: join(output, 'assets-mobile.png') })
  assert.equal(await page.locator('.ent').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  const renamed = page.locator('article').filter({ hasText: '公司简介.txt' })
  await renamed.getByRole('button', { name: '删除' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.getByText('公司简介.txt', { exact: true }).count(), 0)
  assert.deepEqual(errors, [])
})
