/** Real profile and browser proof for Sites creation, asset preview, editing and historical restoration. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('computer workspace verifies isolated claims, uploads, approvals, cancellation and persisted browser state', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(join(root, '.trade-runtime', 'computers-browser-'))
  const evidence = join(root, '.trade-runtime', 'computer-evidence')
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
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const welcome = page.getByRole('dialog', { name: '内测声明' })
  const onboarding = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
  await page.addLocatorHandler(welcome, async () => { await welcome.getByRole('button', { name: '继续' }).click() })
  await page.addLocatorHandler(onboarding, async () => { await onboarding.getByRole('button', { name: '稍后配置' }).click() })
  await page.goto(url)
  await page.getByRole('button', { name: '企业云电脑', exact: true }).click()
  try { await page.getByRole('heading', { name: '企业云电脑', exact: true }).waitFor({ timeout: 10000 }) }
  catch (error) { await page.screenshot({ path: join(evidence, 'failure.png') }); throw new Error(`${error.message}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`) }
  await page.getByRole('button', { name: '绑定工位', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '绑定工位', exact: true })
  for (const [name, value] of [['工位名称', '美国市场工位'], ['独立供应商账号标识', 'research-user'], ['岗位名称', '市场研究员'], ['原生电脑 HTTPS 入口（不含令牌或查询参数）', 'https://grok.com/'], ['岗位职责与授权规则', '只做资料研究；对外写入须先申请审批。']]) await dialog.getByLabel(name, { exact: true }).fill(value)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  const credentialDialog = page.getByRole('dialog', { name: '连接凭据（仅本次显示）', exact: true })
  const token = await credentialDialog.getByLabel('连接凭据（仅本次显示）', { exact: true }).inputValue()
  assert.ok(token.length >= 32)
  await credentialDialog.getByRole('button', { name: '关闭', exact: true }).click()
  const endpoint = new URL('/api/enterprise/computers', url).href
  const command = async body => {
    const response = await context.request.post(endpoint, { data: body })
    assert.equal(response.status(), 200, await response.text())
    return response.json()
  }
  const snapshot = async () => (await context.request.get(endpoint)).json()
  const first = await snapshot()
  const binding = first.bindings[0]
  assert.equal(JSON.stringify(first).includes(token), false)
  const origin = new URL(url).origin
  const worker = (path, method = 'GET', body, key = token, headers = {}) => fetch(`${origin}/computer/v1/${path}`, { method, headers: { authorization: `Bearer ${key}`, ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(10000) })
  assert.equal((await worker('manifest', 'GET', undefined, 'wrong')).status, 401)
  assert.equal((await worker('manifest', 'GET', undefined, token, { origin: origin })).status, 403)
  const manifest = await worker('manifest')
  assert.equal(manifest.headers.get('cache-control'), 'no-store')
  assert.equal((await manifest.json()).capabilities.embeddedDesktop, 'UNVERIFIED')
  assert.equal((await fetch(endpoint)).status, 401)
  const upload = await context.request.post(new URL('/api/enterprise/upload', url).href, { headers: { 'x-file-name': 'source.txt' }, data: 'Approved product facts, revision 1' })
  assert.equal(upload.status(), 201)
  const file = (await upload.json()).files[0]
  await page.getByRole('button', { name: '分配工作', exact: true }).click()
  const workDialog = page.getByRole('dialog', { name: '分配工作', exact: true })
  await workDialog.getByLabel('任务目标', { exact: true }).fill('整理本周客户研究资料')
  await workDialog.getByLabel('本次授权上下文（注明资料版本、已确认条件及未知信息）', { exact: true }).fill('企业资料版本 1；MOQ 未确认；仅允许公开研究。')
  await workDialog.getByLabel('必需成果（每行一项，逐项上传文件）', { exact: true }).fill('客户研究报告')
  await workDialog.getByRole('button', { name: '分配工作', exact: true }).click()
  await workDialog.waitFor({ state: 'hidden' })
  let job = (await snapshot()).jobs[0]
  const duplicateInput = { id: job.id, computerId: job.computerId, objective: job.objective, context: job.context, inputFileIds: job.inputFileIds, expectedOutputs: job.expectedOutputs }
  assert.equal((await command({ action: 'create', job: duplicateInput })).jobs.length, 1)
  const claim = await (await worker('claim', 'POST')).json()
  job = claim.job
  assert.equal(claim.resumed, false)
  const claims = await Promise.all([worker('claim', 'POST'), worker('claim', 'POST')])
  for (const response of claims) { const result = await response.json(); assert.equal(result.job.id, job.id); assert.equal(result.resumed, true) }
  assert.equal((await worker(`file?jobId=${job.id}&id=${file.id}`)).status, 404)
  const other = await command({ action: 'bind', fields: { name: '另一工位', account: 'other-user', worker: 'Analyst', nativeUrl: 'https://grok.com/', instructions: 'Public research' } })
  assert.equal((await worker(`job?id=${job.id}`, 'GET', undefined, other.token)).status, 404)
  const report = async (action, message, expected = 200) => {
    const response = await worker('report', 'POST', { id: job.id, expectedRevision: job.revision, action, message })
    assert.equal(response.status, expected, await response.clone().text())
    if (expected === 200) job = (await response.json()).job
  }
  await report('submit_result', 'Already done', 409)
  await report('request_approval', '申请查询指定公开商业目录，不发送消息。')
  await report('progress', 'Continue without approval', 409)
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await page.getByRole('button', { name: '批准此动作', exact: true }).click()
  await page.getByRole('button', { name: '批准此动作', exact: true }).waitFor({ state: 'hidden' })
  await report('progress', '已获得该动作的审批。')
  const artifact = await worker(`artifact?jobId=${job.id}&revision=${job.revision}&output=0`, 'POST', '# Research report\nEvidence: https://example.com\nMOQ: unknown\n', token, { 'x-file-name': 'research.md' })
  assert.equal(artifact.status, 200, await artifact.clone().text())
  job = (await artifact.json()).job
  assert.equal(job.artifacts[0].sha256.length, 64)
  const download = await context.request.get(new URL(`/api/enterprise/file?id=${job.artifacts[0].fileId}&download=1`, url).href)
  assert.match(await download.text(), /MOQ: unknown/)
  await report('submit_result', '报告已上传；MOQ 尚待核实。')
  assert.equal(job.state, 'VERIFYING')
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await page.getByText('等待验收', { exact: true }).waitFor()
  await page.screenshot({ path: join(evidence, 'computers-desktop.png') })
  await page.getByRole('button', { name: '验收结果', exact: true }).click()
  const review = page.getByRole('dialog', { name: '验收结果', exact: true })
  await review.getByLabel('核对说明').fill('已读取报告，来源与未知信息完整。')
  await review.getByRole('button', { name: '保存', exact: true }).click()
  await review.waitFor({ state: 'hidden' })
  assert.equal((await snapshot()).jobs[0].state, 'SUCCEEDED')
  const enterprise = await (await context.request.get(new URL('/api/enterprise', url).href)).json()
  assert.equal(enterprise.tasks.find(task => task.id === job.taskId).status, 'done')
  const second = await command({ action: 'create', job: { ...duplicateInput, id: crypto.randomUUID(), objective: '验证停止确认', inputFileIds: [file.id] } })
  job = (await (await worker('claim', 'POST')).json()).job
  assert.equal((await worker(`file?jobId=${job.id}&id=${file.id}`)).status, 200)
  await command({ action: 'cancel', id: job.id, expectedRevision: job.revision, comment: '用户要求停止' })
  job = (await (await worker(`job?id=${job.id}`)).json()).job
  assert.equal(job.state, 'CANCEL_REQUESTED')
  await report('submit_result', 'Late completion', 409)
  await report('confirm_stop', '已停止执行，未继续访问网站。')
  assert.equal(job.state, 'CANCELLED')
  await command({ action: 'disconnect', id: binding.id })
  assert.equal((await worker('manifest')).status, 401)
  assert.equal(second.jobs.length, 2)
  await page.reload()
  await page.getByRole('button', { name: '企业云电脑', exact: true }).click()
  await page.getByText('验收通过', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.ent-computers').getBoundingClientRect().width >= 300)
  await page.screenshot({ path: join(evidence, 'computers-mobile.png') })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  const restartJob = { ...duplicateInput, id: crypto.randomUUID(), computerId: other.binding.id, objective: '保留重启前的执行状态' }
  await command({ action: 'create', job: restartJob })
  const beforeRestart = await (await worker('claim', 'POST', undefined, other.token)).json()
  const previousArgs = child.spawnargs.slice(1)
  const exited = once(child, 'exit')
  child.kill(); await exited
  child = spawn(process.execPath, previousArgs, { cwd: root, windowsHide: true, env: { ...environment, DSH_HOME: directory }, stdio: ['ignore', 'pipe', 'pipe'] })
  const restartedOrigin = await new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Restart timed out: ${output}`)), 30000)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Restart exited ${code}`)) })
    child.stderr.on('data', value => { output += value })
    child.stdout.on('data', value => {
      output += value
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
  })
  const resumed = await fetch(`${restartedOrigin}/computer/v1/claim`, { method: 'POST', headers: { authorization: `Bearer ${other.token}` }, signal: AbortSignal.timeout(10000) })
  assert.equal(resumed.status, 200)
  assert.deepEqual(await resumed.json(), { job: beforeRestart.job, resumed: true })
})
