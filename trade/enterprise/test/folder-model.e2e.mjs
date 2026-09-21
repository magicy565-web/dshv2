/** Live folder onboarding uses synthetic sources and fixture-owned human review in an isolated Web profile. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import YAML from '../../../packages/settings/settings-file/node_modules/yaml/dist/index.js'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const liveHome = process.env.DSH_ENTERPRISE_LIVE_HOME
const company = '澄远精工测试企业'
const productNames = ['AX-1 钢制接头', 'BX-2 铝制支架']

test('live model reads a folder, separates two products and completes only after human reviews', { skip: !liveHome, timeout: 360000 }, async t => {
  const stored = YAML.parse(await readFile(join(liveHome, 'settings.yaml'), 'utf8'))
  const credentials = YAML.parse(await readFile(join(liveHome, '.credentials.yaml'), 'utf8'))
  const reference = stored['llm-deepseek'].apiKeyEnv ?? 'DEEPSEEK_API_KEY'
  const secret = process.env[reference] || credentials.refs?.[reference]
  assert.ok(secret, 'The explicitly selected live home must have its configured credential')
  await mkdir(join(root, '.trade-runtime'), { recursive: true })
  const directory = await mkdtemp(join(root, '.trade-runtime', 'folder-model-run-'))
  const evidence = await mkdtemp(join(root, '.trade-runtime', 'folder-model-evidence-'))
  const home = join(directory, 'home')
  let child, browser, page, context, url
  let logs = '', lastState
  const reviews = [], pageErrors = []
  const redact = text => text.replaceAll(secret, '[REDACTED]').replace(/token=[^\s]+/g, 'token=[REDACTED]')
  t.after(async () => {
    try {
      if (page) {
        await writeFile(join(evidence, 'conversation.txt'), redact(await page.locator('body').innerText()))
        await page.screenshot({ path: join(evidence, 'conversation.png'), fullPage: true })
      }
      await writeFile(join(evidence, 'result.json'), JSON.stringify({ state: lastState, reviews, pageErrors }, null, 2) + '\n')
      await writeFile(join(evidence, 'server.log'), redact(logs))
    } finally {
      try { await browser?.close() }
      finally {
        if (child && child.exitCode === null && child.signalCode === null) { const exit = once(child, 'exit'); child.kill(); await exit }
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
    }
    t.diagnostic(`Live onboarding evidence: ${evidence}`)
  })
  await mkdir(home)
  await writeFile(join(home, 'settings.yaml'), YAML.stringify({ 'llm-deepseek': stored['llm-deepseek'], 'agent-default-model': stored['agent-default-model'] }))
  const material = join(directory, '澄远资料')
  await mkdir(material)
  await writeFile(join(material, '企业介绍.md'), `# ${company}\n这是虚构的验收测试企业，不代表真实商家。主营工业连接件和安装支架，为设备制造商提供标准零件。企业网站 https://example.com/company 。企业自身制造，销售区域为中国。\n本次资料包含两款产品 AX-1 钢制接头和 BX-2 铝制支架。没有其他产品。价格、认证、库存和交期均未提供，保持未知，不作承诺。\n`)
  await writeFile(join(material, '产品目录.csv'), `产品名称,型号,材料,用途,最小起订量,单位,来源日期\nAX-1 钢制接头,AX-1,钢,设备管路连接,100,件,2026-09-20\nBX-2 铝制支架,BX-2,铝,传感器安装,20,件,2026-09-20\n`)
  const patch = join(directory, 'override.yml')
  await writeFile(patch, JSON.stringify([{ id: 'session-title-llm', disabled: true }, { id: 'trade-enterprise', config: { directory: join(directory, 'data'), maxFileBytes: 1048576, maxTotalBytes: 10485760, maxExtractedCharacters: 1000000, knowledgeChunkCharacters: 1200, maxKnowledgeResults: 8, maxDecompressedBytes: 134217728, maxArchiveEntries: 5000, maxTableCells: 250000 } }]))
  child = spawn(process.execPath, [join(root, 'apps/cli/lib/bin.js'), '--profile', 'trade', '--from-default-profile', 'web', '--patch', join(root, 'trade/cordis.patch.yml'), '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'], { cwd: directory, windowsHide: true, env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_MODE: 'DISABLED', [reference]: secret }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stderr.on('data', data => { logs += data })
  url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Web startup timed out: ' + redact(logs))), 30000)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Web exited ${code}: ${redact(logs)}`)) })
    child.stdout.on('data', data => { logs += data; const match = logs.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
  })
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true })
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
  page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addLocatorHandler(page.getByRole('dialog', { name: '内测声明' }), async dialog => { await dialog.getByRole('button', { name: '继续' }).click() })
  await page.goto(url)
  await page.getByRole('heading', { name: '从企业资料文件夹建档' }).waitFor({ timeout: 20000 })
  await page.locator('.ent-source-panel input[type=file]').setInputFiles(material)
  await page.getByRole('button', { name: '导入所选资料', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.ent-source-history') && !document.querySelector('.ent-source-panel button[disabled]'))
  await page.getByRole('button', { name: '读取资料并建档', exact: true }).click()
  const snapshot = async () => (await context.request.get(new URL('/api/enterprise', url).href)).json()
  const answered = new Set()
  const clarification = '确认按虚构测试资料建立内部档案。本次范围就是澄远精工测试企业、AX-1 钢制接头、BX-2 铝制支架，全部以导入资料为准。没有其他产品或补充信息。价格、认证、库存、交期及其他未提供的选填事实均保持未知，不影响建立内部档案。请保存已知事实并逐份发起档案审阅。'
  const deadline = Date.now() + 300000
  while (Date.now() < deadline) {
    lastState = await snapshot()
    if (lastState.onboarding.completedAt) break
    const resume = page.getByRole('button', { name: '继续建档对话', exact: true })
    if (await resume.isVisible()) {
      await resume.click()
      await page.locator('.ent').waitFor({ state: 'hidden' })
    }
    const question = page.locator('[data-question-key]')
    if (await question.count()) {
      const key = await question.getAttribute('data-question-key')
      const title = await question.getByRole('heading').innerText()
      const identity = `${key}:${title}`
      if (!answered.has(identity)) {
        const content = await question.innerText()
        reviews.push({ title, content })
        t.diagnostic(`Fixture user review: ${title}`)
        const confirm = question.getByRole('radio', { name: '确认', exact: true })
        if (title === '请确认企业资料草稿是否准确。' || title === '请确认产品资料草稿是否准确。' || title === '以下档案是否已覆盖本次需要建立的企业和产品范围？') {
          assert.ok([company, ...productNames].some(name => content.includes(name)), 'Review must display fixture-owned content')
          assert.ok(!/ISO[ -]?9001|[¥$]\s*\d/.test(content), 'The Agent cannot manufacture a certification or price')
          if (title.includes('覆盖')) {
            assert.equal(lastState.geo.filter(record => record.status === 'confirmed').length, 3)
            assert.ok(lastState.imports.every(batch => batch.files.every(file => file.assessment?.disposition === 'used')))
          }
          await confirm.click()
        } else {
          await question.getByPlaceholder('输入你的答案', { exact: true }).fill(clarification)
        }
        answered.add(identity)
        await question.locator('footer button').last().click()
      }
    } else if (lastState.geo.length === 3 && await page.getByRole('button', { name: '停止生成', exact: true }).count() === 0) {
      const stage = lastState.geo.every(record => record.status === 'confirmed') ? 'scope' : 'clarification'
      if (!answered.has(stage)) {
        answered.add(stage)
        await page.locator('[data-composer-input]').fill(stage === 'scope' ? '没有其他产品，本次仅包含已确认的这家企业和两款产品。请发起最终范围确认。' : clarification)
        await page.getByRole('button', { name: '发送消息', exact: true }).click()
      }
    }
    await delay(500)
  }
  assert.ok(lastState.onboarding.completedAt, 'Onboarding must finish within the bounded live run')
  assert.equal(lastState.profile.name, company)
  const products = lastState.geo.filter(record => record.kind === 'product')
  assert.equal(products.length, 2)
  for (const [sku, materialName, moq] of [['AX-1', '钢', 100], ['BX-2', '铝', 20]]) {
    const product = products.find(record => record.name.includes(sku))
    assert.ok(product, `Missing ${sku}`)
    assert.equal(product.status, 'confirmed')
    assert.ok(JSON.stringify(product).includes(materialName))
    assert.ok(JSON.stringify(product).includes(String(moq)))
    assert.ok(product.assetIds.some(id => lastState.files.find(file => file.id === id)?.name === '产品目录.csv'))
    assert.ok(product.sections.some(section => section.source.includes('产品目录.csv')))
    assert.ok(product.sections.every(section => /\[资料: 澄远资料\/(产品目录\.csv|企业介绍\.md)#片段1\]/.test(section.source)))
  }
  assert.equal(reviews.filter(review => /请确认(企业|产品)资料草稿是否准确/.test(review.title)).length, 3)
  assert.ok(lastState.imports[0].files.every(file => file.readChunks.length === file.chunkCount && file.chunkCount > 0))
  assert.deepEqual(pageErrors, [])
  await page.reload()
  assert.equal((await snapshot()).onboarding.completedAt, lastState.onboarding.completedAt)
})
