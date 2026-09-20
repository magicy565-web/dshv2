/** Real profile and browser proof for Sites creation, asset preview, editing and historical restoration. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { unzipSync } from 'fflate'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('Sites runs saved browser code in a private preview and restores source revisions', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(join(root, '.trade-runtime', 'sites-browser-'))
  const evidence = join(root, '.trade-runtime', 'sites-evidence')
  await mkdir(evidence, { recursive: true })
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
  const profileDirectory = join(directory, 'profiles', 'trade')
  await mkdir(profileDirectory, { recursive: true })
  await writeFile(join(profileDirectory, 'package.json'), JSON.stringify({ name: 'dsh-profile-trade', private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' } } }))
  await writeFile(join(profileDirectory, 'cordis.yml'), '[]\n')
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '[]\n')
  await writeFile(patch, JSON.stringify([{ id: 'trade-enterprise', config: {
    directory: join(directory, 'data'), maxFileBytes: 1048576, maxTotalBytes: 10485760,
    maxExtractedCharacters: 1000000, knowledgeChunkCharacters: 1200, maxKnowledgeResults: 8,
    maxDecompressedBytes: 134217728, maxArchiveEntries: 5000, maxTableCells: 250000,
  } }]))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
  child = spawn(process.execPath, [join(root, 'apps/cli/lib/bin.js'), '--profile', 'trade', '--patch', join(root, 'trade/cordis.patch.yml'), '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: root, windowsHide: true, env: { ...environment, DSH_HOME: directory }, stdio: ['ignore', 'pipe', 'pipe'],
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
  const welcome = page.getByRole('dialog', { name: '内测声明' })
  const onboarding = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  await page.addLocatorHandler(welcome, async () => { await welcome.getByRole('button', { name: '继续' }).click() })
  await page.addLocatorHandler(onboarding, async () => { await onboarding.getByRole('button', { name: '稍后配置' }).click() })
  await page.goto(url)
  try { await page.getByRole('button', { name: 'Sites', exact: true }).click() }
  catch (error) { throw new Error(`${error.message}\nBrowser errors: ${errors.join('\n')}\nPage: ${await page.locator('body').innerText()}`) }
  await page.getByRole('heading', { name: '你的网站，从一句话开始' }).waitFor()
  await page.screenshot({ path: join(evidence, 'sites-empty-desktop.png') })
  const endpoint = new URL('/api/enterprise/sites', url).href
  const created = await context.request.post(endpoint, { data: { name: 'Northwind Studio' } })
  assert.equal(created.status(), 201, await created.text())
  const site = await created.json()
  const html = '<!doctype html><html><head><title>Northwind</title><link rel="stylesheet" href="/styles.css"></head><body><header>Northwind Studio</header><main><p>DESIGNED FOR EVERYDAY LIVING</p><h1>Thoughtful objects.<br>A quieter home.</h1><p>Discover a collection shaped by natural materials and lasting design.</p><button>Explore collection</button><span id="count">0</span><img src="/mark.svg" alt="Leaf"></main><script type="module" src="/app.js"></script></body></html>'
  const files = [
    { path: 'index.html', content: html, encoding: 'utf8' },
    { path: 'styles.css', content: 'body{margin:0;background:#f4f0e7;color:#233c2e;font-family:Georgia,serif}header{padding:24px;border-bottom:1px solid #d4d6c8}main{padding:64px 40px;max-width:680px;margin:auto}h1{font-size:clamp(32px,5vw,54px);line-height:1.1}p{line-height:1.8}button{padding:14px 24px;background:#254f38;color:white;border:0;border-radius:24px;cursor:pointer}#count{margin:20px}img{width:50px;display:block;margin-top:25px}', encoding: 'utf8' },
    { path: 'app.js', content: 'import { count } from "./counter.js"; document.querySelector("button").onclick = () => { document.querySelector("#count").textContent = String(count) }', encoding: 'utf8' },
    { path: 'counter.js', content: 'export const count = 1', encoding: 'utf8' },
    { path: 'mark.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="#47875d" d="M5 35Q5 2 36 4Q38 35 5 35"/></svg>', encoding: 'utf8' },
  ]
  const saved = await context.request.post(`${endpoint}?siteId=${site.id}&action=revisions`, { data: { changeSet: { project: { framework: 'static', files } } } })
  assert.equal(saved.status(), 201, await saved.text())
  const first = await saved.json()
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await page.getByRole('button', { name: /Northwind Studio/ }).click()
  const frame = page.frameLocator('iframe[title="预览"]')
  await frame.getByRole('heading', { name: 'Thoughtful objects. A quieter home.' }).waitFor()
  await frame.getByRole('button', { name: 'Explore collection' }).click()
  assert.equal(await frame.locator('#count').textContent(), '1')
  assert.equal(await frame.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(244, 240, 231)')
  assert.equal(await frame.getByAltText('Leaf').evaluate(image => image.complete && image.naturalWidth > 0), true)
  assert.equal(await frame.locator('body').evaluate(() => { try { void parent.document.body; return false } catch { return true } }), true)
  await page.screenshot({ path: join(evidence, 'sites-preview-desktop.png') })
  await page.getByRole('button', { name: '源码', exact: true }).click()
  await page.getByRole('textbox', { name: '源码', exact: true }).fill(html.replace('A quieter home.', 'A brighter home.'))
  await page.getByRole('button', { name: '保存新版本' }).click()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await frame.getByRole('heading', { name: 'Thoughtful objects. A brighter home.' }).waitFor()
  await page.getByRole('button', { name: '源码', exact: true }).click()
  const badge = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="orange"/></svg>')
  await page.getByRole('textbox', { name: '源码', exact: true }).fill(html.replace('A quieter home.', 'A brighter home.').replace('</main>', '<img src="/assets/badge.svg" alt="Uploaded badge"></main>'))
  const picker = page.getByLabel('选择资源文件', { exact: true })
  await picker.setInputFiles({ name: 'badge.svg', mimeType: 'image/svg+xml', buffer: badge })
  await page.getByRole('status').filter({ hasText: '有未保存的修改' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '刷新', exact: true }).isDisabled(), true)
  assert.equal(await page.getByLabel('版本', { exact: true }).isDisabled(), true)
  await picker.setInputFiles({ name: 'badge.svg', mimeType: 'image/svg+xml', buffer: badge })
  await page.getByRole('alert').filter({ hasText: '存在同路径文件' }).waitFor()
  await page.getByRole('checkbox', { name: '替换同路径文件', exact: true }).check()
  await picker.setInputFiles({ name: 'badge.svg', mimeType: 'image/svg+xml', buffer: badge })
  await page.getByRole('button', { name: '保存新版本', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '有未保存的修改' }).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await frame.getByAltText('Uploaded badge').waitFor()
  assert.equal(await frame.getByAltText('Uploaded badge').evaluate(image => image.complete && image.naturalWidth > 0), true)
  await page.getByRole('button', { name: '源码', exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出源码', exact: true }).click()
  const download = await downloadEvent
  assert.equal(download.suggestedFilename(), `${site.id}.zip`)
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const archive = unzipSync(Buffer.concat(chunks))
  assert.deepEqual(Buffer.from(archive['assets/badge.svg']), badge)
  assert.match(Buffer.from(archive['index.html']).toString(), /Uploaded badge/)
  await picker.setInputFiles({ name: 'large.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(1048577) })
  await page.getByRole('alert').filter({ hasText: '完整项目超过' }).waitFor()
  const beforeForbidden = (await (await context.request.get(endpoint)).json()).items.find(item => item.id === site.id).currentRevisionId
  await page.getByRole('textbox', { name: '资源目录', exact: true }).fill('')
  await picker.setInputFiles({ name: '.env', mimeType: 'text/plain', buffer: Buffer.from('EXAMPLE_NOT_A_SECRET=fixture') })
  await page.getByRole('button', { name: '保存新版本', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '文件路径或项目内容无效' }).waitFor()
  const afterForbidden = (await (await context.request.get(endpoint)).json()).items.find(item => item.id === site.id).currentRevisionId
  assert.equal(afterForbidden, beforeForbidden)
  await page.getByRole('button', { name: '放弃未保存修改', exact: true }).click()
  await page.getByRole('textbox', { name: '资源目录', exact: true }).fill('assets')
  await page.getByRole('textbox', { name: '源码', exact: true }).fill('Unsaved text')
  await page.getByRole('button', { name: '放弃未保存修改', exact: true }).click()
  assert.match(await page.getByRole('textbox', { name: '源码', exact: true }).inputValue(), /Uploaded badge/)
  await page.screenshot({ path: join(evidence, 'sites-assets-editor.png'), fullPage: true })
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.getByLabel('版本', { exact: true }).selectOption(first.id)
  await page.getByRole('button', { name: '恢复为草稿' }).click()
  await frame.getByRole('heading', { name: 'Thoughtful objects. A quieter home.' }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Sites', exact: true }).click()
  await page.getByRole('button', { name: /Northwind Studio/ }).click()
  await frame.getByRole('heading', { name: 'Thoughtful objects. A quieter home.' }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.site-main').getBoundingClientRect().width >= 270)
  await page.getByRole('button', { name: '手机', exact: true }).click()
  await page.screenshot({ path: join(evidence, 'sites-preview-mobile.png') })
  assert.ok(await page.locator('.site-main').evaluate(element => element.getBoundingClientRect().width) >= 270, await page.locator('.site-workspace').evaluate(element => JSON.stringify({ width: element.getBoundingClientRect().width, parent: element.parentElement.outerHTML.slice(0, 500) })))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const deployment = { id: crypto.randomUUID(), revisionId: first.id, digest: 'a'.repeat(64), createdAt: new Date().toISOString(), status: 'ready', buildId: 'dpl_reviewed', previewUrl: 'https://preview.vercel.app', published: false }
  const hosted = { siteId: site.id, generation: 1, configured: true, projectId: 'prj_browser', deployments: [deployment], domains: [] }
  const publications = []
  const availabilityChanges = []
  const domainChanges = []
  await page.route('**/api/enterprise/sites?*', async route => {
    const action = new URL(route.request().url()).searchParams.get('action')
    if (action === 'hosting-publish') {
      publications.push(route.request().postDataJSON())
      hosted.pendingPromotionId = deployment.id
      return route.fulfill({ json: hosted, status: 202 })
    }
    if (action === 'hosting-availability') {
      const input = route.request().postDataJSON()
      availabilityChanges.push(input)
      hosted.pendingAvailability = { paused: input.paused, deploymentId: input.expectedLiveDeploymentId, requestedAt: new Date().toISOString() }
      hosted.generation++
      return route.fulfill({ json: hosted, status: 202 })
    }
    if (action === 'hosting-domain') {
      const input = route.request().postDataJSON()
      domainChanges.push({ input, observedGeneration: hosted.generation })
      hosted.pendingDomain = { operation: input.operation, name: input.name, requestedAt: new Date().toISOString() }
      hosted.generation++
      return route.fulfill({ json: hosted, status: 202 })
    }
    if (action === 'hosting-refresh') {
      if (hosted.pendingPromotionId) {
        hosted.liveDeploymentId = deployment.id
        hosted.productionUrl = 'https://studio.example'
        hosted.availability = 'online'
        deployment.published = true
        delete hosted.pendingPromotionId
      }
      if (hosted.pendingAvailability) {
        hosted.availability = hosted.pendingAvailability.paused ? 'offline' : 'online'
        delete hosted.pendingAvailability
      }
      if (hosted.pendingDomain) {
        const { operation, name } = hosted.pendingDomain
        if (operation === 'add') hosted.domains.push({ name, managed: false, verified: false, configured: false, dns: [
          { type: 'TXT', name: '_vercel.example.com', value: 'vc-domain-verify=browser-proof', purpose: 'ownership' },
          { type: 'CNAME', name, value: 'target.vercel-dns.com', purpose: 'routing' },
        ] })
        if (operation === 'verify') hosted.domains = hosted.domains.map(domain => ({ ...domain, verified: true, configured: true }))
        if (operation === 'remove') hosted.domains = hosted.domains.filter(domain => domain.name !== name)
        delete hosted.pendingDomain
      }
      hosted.generation++
      return route.fulfill({ json: hosted })
    }
    if (action === 'hosting') return route.fulfill({ json: hosted })
    return route.continue()
  })
  await page.reload()
  await page.getByRole('button', { name: 'Sites', exact: true }).click()
  await page.getByRole('button', { name: /Northwind Studio/ }).click()
  await page.getByRole('button', { name: '检查并发布', exact: true }).click()
  const publish = page.getByRole('button', { name: '发布此版本', exact: true })
  assert.equal(await publish.isDisabled(), true)
  await page.getByRole('checkbox', { name: '我已检查此版本，确认其中内容可以公开。' }).check()
  await page.screenshot({ path: join(evidence, 'sites-publish-review.png'), fullPage: true })
  await publish.click()
  await page.getByRole('status').filter({ hasText: '正在等待正式地址切换确认' }).waitFor()
  assert.deepEqual(publications, [{ deploymentId: deployment.id, digest: deployment.digest, expectedLiveDeploymentId: null, confirmed: true }])
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  await page.getByRole('button', { name: '下线网站', exact: true }).click()
  await page.getByRole('button', { name: '确认下线', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '正在等待云端确认访问状态' }).waitFor()
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  await page.getByRole('button', { name: '恢复访问', exact: true }).click()
  assert.equal(await page.getByRole('link', { name: '打开网站', exact: true }).count(), 0)
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  await page.getByRole('link', { name: '打开网站', exact: true }).waitFor()
  assert.deepEqual(availabilityChanges, [
    { paused: true, expectedLiveDeploymentId: deployment.id, confirmed: true },
    { paused: false, expectedLiveDeploymentId: deployment.id, confirmed: true },
  ])
  await page.getByRole('textbox', { name: '域名', exact: true }).fill('https://wrong.example/path')
  await page.getByRole('button', { name: '添加域名', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '请输入域名' }).waitFor()
  assert.equal(domainChanges.length, 0)
  await page.getByRole('textbox', { name: '域名', exact: true }).fill('WWW.Example.com')
  await page.getByRole('button', { name: '添加域名', exact: true }).click()
  await page.getByRole('button', { name: '确认域名变更', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '正在等待域名操作确认' }).waitFor()
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  await page.getByRole('cell', { name: 'vc-domain-verify=browser-proof', exact: true }).waitFor()
  await page.locator('.site-domains').screenshot({ path: join(evidence, 'sites-domain-dns.png') })
  await page.getByRole('button', { name: '验证域名', exact: true }).click()
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  await page.getByText('所有权已验证', { exact: true }).waitFor()
  await page.getByText('DNS 已就绪', { exact: true }).waitFor()
  await page.getByRole('button', { name: '移除域名', exact: true }).click()
  await page.getByRole('button', { name: '确认域名变更', exact: true }).click()
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  await page.getByRole('button', { name: '验证域名', exact: true }).waitFor({ state: 'detached' })
  assert.equal(await page.getByRole('button', { name: '验证域名', exact: true }).count(), 0)
  assert.deepEqual(domainChanges.map(({ input }) => input.operation), ['add', 'verify', 'remove'])
  const failedBuild = { ...deployment, id: crypto.randomUUID(), buildId: 'dpl_failed', status: 'failed', published: false, error: 'Compilation failed: app/page.tsx' }
  hosted.deployments.unshift(failedBuild)
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  await page.getByText('构建日志暂不可用，刷新状态后重试。', { exact: true }).waitFor()
  failedBuild.buildLog = 'app/page.tsx:3: Cannot find module ./catalog\n<img alt="diagnostic" src="missing" onerror="throw new Error(\'injected\')">'
  await page.getByRole('button', { name: '刷新构建状态', exact: true }).click()
  const failureCard = page.locator('.site-deployments article').filter({ hasText: 'Compilation failed: app/page.tsx' })
  await failureCard.getByText('构建日志（末尾片段）', { exact: true }).waitFor()
  assert.equal(await failureCard.locator('.site-build-log').last().textContent(), failedBuild.buildLog)
  assert.equal(await failureCard.locator('img').count(), 0)
  assert.equal(await failureCard.getByRole('button', { name: '检查并发布', exact: true }).isDisabled(), true)
  await failureCard.screenshot({ path: join(evidence, 'sites-build-diagnostics.png') })
  for (const { input, observedGeneration } of domainChanges) assert.deepEqual(input, { operation: input.operation, name: 'www.example.com', expectedGeneration: observedGeneration, confirmed: true })
  assert.deepEqual(errors, [])
})
