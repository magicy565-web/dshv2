/** Real dsh Web flow against isolated enterprise storage and an OS-assigned port. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('business goals and task outcomes persist through the native workspace', { timeout: 120000 }, async t => {
  await mkdir(join(root, '.trade-runtime'), { recursive: true })
  const directory = await mkdtemp(join(root, '.trade-runtime', 'enterprise-ui-'))
  const output = await mkdtemp(join(root, '.trade-runtime', 'business-goals-evidence-'))
  await mkdir(output, { recursive: true })
  let child
  let browser
  let page
  t.after(async () => {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: join(output, 'final-state.png'), fullPage: true })
      await writeFile(join(output, 'visible-text.txt'), await page.locator('body').innerText())
    }
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
  const cliArgs = [join(root, 'apps/cli/lib/bin.js'), '--profile', 'trade', '--from-default-profile', 'web']
  cliArgs.push('--patch', join(root, 'trade/cordis.patch.yml'), '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open')
  child = spawn(process.execPath, cliArgs, {
    cwd: directory, windowsHide: true, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/TOKEN|SECRET|KEY|PASSWORD/i.test(key))), DSH_HOME: join(directory, 'home') }, stdio: ['ignore', 'pipe', 'pipe'],
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
  page = await context.newPage()
  await page.addLocatorHandler(page.getByRole('dialog', { name: '内测声明' }), async dialog => { await dialog.getByRole('button', { name: '继续' }).click() })
  await page.addLocatorHandler(page.getByRole('dialog', { name: '添加一个 API Key 开始使用' }), async dialog => { await dialog.getByRole('button', { name: '稍后配置' }).click() })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  t.diagnostic(`Browser evidence: ${output}`)
  await page.goto(url)
  const welcome = page.getByRole('dialog', { name: '内测声明' })
  if (await welcome.count()) await welcome.getByRole('button', { name: '继续' }).click()
  const onboarding = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  if (await onboarding.count()) await onboarding.getByRole('button', { name: '稍后配置' }).click()
  await page.getByRole('heading', { name: '先认识你的企业。', exact: true }).waitFor({ timeout: 20000 })
  const endpoint = path => new URL(`/api/enterprise${path}`, url).href
  const seeded = await context.request.post(endpoint('/profile'), { data: { name: '远帆贸易', kind: 'enterprise', description: '工业零件出口', business: '工业零件', website: '', contact: '', email: '', phone: '', address: '', logoId: null } })
  assert.equal(seeded.status(), 200)
  await page.reload()
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByRole('tab', { name: '业务目标', exact: true }).click()
  await page.getByRole('button', { name: '新建目标', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('目标名称', { exact: true }).fill('验证德国买家需求')
  await dialog.getByLabel('成功标准', { exact: true }).fill('取得两位买家对产品规格的书面确认。')
  await dialog.getByLabel('负责人', { exact: true }).fill('Ada')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: '验证德国买家需求', exact: true }).waitFor()
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('任务标题', { exact: true }).fill('核对第一位买家询盘')
  await dialog.getByLabel('任务说明', { exact: true }).fill('确认尺寸和材料要求。')
  assert.notEqual(await dialog.getByLabel('关联业务目标').inputValue(), '')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByLabel('任务状态 核对第一位买家询盘', { exact: true }).selectOption('done')
  dialog = page.getByRole('dialog')
  assert.equal(await dialog.getByRole('button', { name: '保存', exact: true }).isDisabled(), true)
  await dialog.getByLabel('任务结果与依据', { exact: false }).fill('第一位买家已通过询盘确认尺寸，材料仍待核对。')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText('1 / 1 个任务已完成 · 0 个受阻', { exact: true }).waitFor()
  const saved = await (await context.request.get(endpoint(''))).json()
  assert.equal(saved.goals[0].status, 'active')
  assert.equal(saved.tasks[0].goalId, saved.goals[0].id)
  assert.match(saved.tasks[0].outcome, /材料仍待核对/)
  await page.screenshot({ path: join(output, 'goals-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.ent').getBoundingClientRect().x <= 57)
  assert.equal(await page.locator('.ent').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  await page.screenshot({ path: join(output, 'goals-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '编辑目标', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('目标状态').selectOption('achieved')
  assert.equal(await dialog.getByRole('button', { name: '保存', exact: true }).isDisabled(), true)
  await dialog.getByLabel('实际结果与依据', { exact: false }).fill('两位买家均已书面确认规格，回复保存在企业资料。')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.reload()
  await page.getByRole('button', { name: '企业空间', exact: true }).click()
  await page.getByRole('tab', { name: '业务目标', exact: true }).click()
  await page.getByText('两位买家均已书面确认规格，回复保存在企业资料。', { exact: true }).waitFor()
  const stale = await context.request.post(endpoint('/goals'), { data: { action: 'archive', id: saved.goals[0].id, expectedRevision: 1, archived: true } })
  assert.equal(stale.status(), 409)
  assert.deepEqual(errors, [])
})
