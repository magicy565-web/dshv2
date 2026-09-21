/** Built-plugin composition checks with private per-test storage and awaited disposal. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { Context } from '../../../vendor/cordis/lib/index.js'
import { DatabaseSync } from 'node:sqlite'
import { HostConnectionService } from '../../../packages/client/connection/lib/index.js'
import SystemPrompt from '../../../packages/core/system-prompt/lib/index.js'
import ToolRuntime from '../../../packages/core/tools/lib/index.js'
import SkillRegistry from '../../../packages/skill/skill/lib/index.js'
import AgentRegistry, { agentEvents } from '../../../packages/core/agent/lib/index.js'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '../../../packages/core/session/lib/index.js'
import { createUserMessage } from '../../../packages/llm/llm/lib/index.js'
import * as toolSkill from '../../../packages/skill/tool-skill/lib/index.js'
import * as enterprise from '../lib/index.js'

const profile = { name: 'Test Studio', kind: 'studio', description: 'Export products', business: '', website: '', contact: '', email: '', phone: '', address: '', logoId: null }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64')
const knowledgeLimits = { maxExtractedCharacters: 10000, knowledgeChunkCharacters: 512, maxKnowledgeResults: 5, maxDecompressedBytes: 1048576, maxArchiveEntries: 100, maxTableCells: 1000 }
const docx = Buffer.from(zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Precision export components for renewable energy buyers</w:t></w:r></w:p></w:body></w:document>'),
}))

async function mount(directory, limits = {}) {
  const ctx = new Context()
  ctx.provide('webServer', { register: () => () => {} })
  const systemPromptFiber = ctx.plugin(SystemPrompt)
  await systemPromptFiber.await()
  const toolsFiber = ctx.plugin(ToolRuntime)
  await toolsFiber.await()
  const skillsFiber = ctx.plugin(SkillRegistry)
  await skillsFiber.await()
  const agentsFiber = ctx.plugin(AgentRegistry)
  await agentsFiber.await()
  const skillToolFiber = ctx.plugin(toolSkill)
  await skillToolFiber.await()
  const connectionFiber = ctx.plugin(pluginCtx => { new HostConnectionService(pluginCtx, [], {}) })
  await connectionFiber.await()
  const fiber = ctx.plugin(enterprise, { directory, maxFileBytes: 1024, maxTotalBytes: 2048, ...knowledgeLimits, ...limits })
  await fiber.await()
  const carrier = ctx.get('connection').createSharedFetchHandler('/api')
  return {
    async call(path = '', body, headers = {}) {
      const upload = path === '/upload'
      return carrier.fetch(new Request(`http://localhost/api/enterprise${path}`, {
        method: body === undefined ? 'GET' : 'POST', headers,
        ...(body === undefined ? {} : { body: upload ? body : JSON.stringify(body), duplex: 'half' }),
      }))
    },
    fetch: request => carrier.fetch(request),
    search: query => ctx.tools.execute({ signal: new AbortController().signal, callId: `enterprise-${Date.now()}`, name: 'enterprise_search', arguments: { query } }),
    execute: (name, arguments_) => ctx.tools.execute({ signal: new AbortController().signal, callId: `enterprise-${Date.now()}`, name, arguments: arguments_ }),
    async invokeSkill(name = 'product-geo') {
      const id = SessionId(crypto.randomUUID())
      const session = Session.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd: directory, isSeeded: false })
      const agent = { id, session, ctx: new Context(), options: {}, status: 'idle' }
      const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: `/${name} Start workflow` }] })]
      return agentEvents(ctx, agent).waterfall('agent/pre-step', { messages, turn: 1, step: 1, signal: new AbortController().signal }, () => Promise.resolve({ kind: 'enter', messages }))
    },
    async dispose() { await fiber.dispose(); await connectionFiber.dispose(); await skillToolFiber.dispose(); await agentsFiber.dispose(); await skillsFiber.dispose(); await toolsFiber.dispose(); await systemPromptFiber.dispose() },
  }
}

test('native chat invocation loads the complete bundled onboarding skill before the model step', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-skill-invocation-'))
  const app = await mount(directory)
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  const decision = await app.invokeSkill()
  assert.equal(decision.kind, 'enter')
  const instructions = decision.messages.filter(message => message.source.kind === 'skill-invocation')
  assert.equal(instructions.length, 1)
  assert.equal(instructions[0].source.name, 'product-geo')
  assert.match(instructions[0].content[0].text, /## 5. Confirm and finish in chat/)
  assert.match(instructions[0].content[0].text, /enterprise_geo_review/)
})

test('buyer research skill saves evidence-backed opportunities and rejects stale or unsupported qualification', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-opportunities-'))
  let app = await mount(directory)
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  await app.call('/profile', profile)
  const decision = await app.invokeSkill('overseas-buyer-research')
  const instructions = decision.messages.filter(message => message.source.kind === 'skill-invocation')
  assert.equal(instructions[0].source.name, 'overseas-buyer-research')
  assert.match(instructions[0].content[0].text, /## 3. Check evidence and fit/)
  const id = crypto.randomUUID()
  const fields = { buyerName: 'Example Import GmbH', buyerWebsite: 'https://buyer.example', country: 'Germany', targetProduct: 'Printed rayon fabric', contactName: '', contactRole: '', contactEmail: '', summary: 'Imports apparel textiles for regional brands.', matchScore: 72, matchRationale: 'The current catalog includes the target category.', procurementSignals: ['Lists printed rayon fabric in the current catalog'], evidence: [{ label: 'Buyer catalog', uri: 'https://buyer.example/catalog', note: 'Lists printed rayon fabric.', observedAt: '2026-09-16T10:00:00.000Z' }], status: 'qualified', nextAction: 'Identify the textile sourcing manager.', lastContactAt: null }
  const created = await app.execute('enterprise_opportunity_save', { action: 'create', id, fields })
  assert.equal(created.value.revision, 1)
  assert.equal((await app.execute('enterprise_opportunity_list', { country: 'germany' })).value.items[0].buyerName, fields.buyerName)
  assert.equal((await app.execute('enterprise_opportunity_save', { action: 'update', id, expectedRevision: 1, fields: { ...fields, evidence: [] } })).isError, true)
  const updated = await app.execute('enterprise_opportunity_save', { action: 'update', id, expectedRevision: 1, fields: { ...fields, status: 'contacted', lastContactAt: '2026-09-16T11:00:00.000Z' } })
  assert.equal(updated.value.revision, 2)
  assert.equal((await app.execute('enterprise_opportunity_save', { action: 'update', id, expectedRevision: 1, fields })).isError, true)
  await app.dispose()
  app = await mount(directory)
  const restored = await (await app.call('/opportunities')).json()
  assert.equal(restored.opportunities[0].status, 'contacted')
  const db = new DatabaseSync(join(directory, 'enterprise.sqlite'))
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 15)
  db.close()
})

test('business goals link work, retain outcomes across restart and require explicit achievement', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-goals-'))
  let app
  t.after(async () => { await app?.dispose(); await rm(directory, { recursive: true, force: true }) })
  app = await mount(directory, { maxWorkItems: 1 })
  const id = crypto.randomUUID()
  const fields = { title: 'Qualify two buyers', successCriteria: 'Two buyers confirm product fit in writing.', owner: 'Ada', dueDate: '2030-10-01', status: 'active', outcome: '' }
  assert.equal((await app.call('/goals', { action: 'create', id, fields })).status, 409)
  await app.call('/profile', profile)
  assert.equal((await app.call('/goals', { action: 'create', id, fields: { ...fields, successCriteria: '' } })).status, 400)
  assert.equal((await app.call('/goals', { action: 'create', id, fields })).status, 200)
  assert.equal((await app.call('/goals', { action: 'create', id, fields })).status, 409)
  const taskId = crypto.randomUUID()
  const task = { title: 'Review inquiry', description: 'Check product requirements', assignee: 'Ada', dueDate: null, status: 'todo', goalId: id, outcome: '' }
  assert.equal((await app.call('/tasks', { action: 'create', id: taskId, fields: { ...task, goalId: crypto.randomUUID() } })).status, 404)
  assert.equal((await app.call('/tasks', { action: 'create', id: taskId, fields: task })).status, 200)
  assert.equal((await app.call('/tasks', { action: 'update', id: taskId, expectedRevision: 1, fields: { ...task, status: 'done' } })).status, 400)
  assert.equal((await app.call('/tasks', { action: 'update', id: taskId, expectedRevision: 1, fields: { ...task, status: 'done', outcome: 'One buyer confirmed dimensions in the inquiry.' } })).status, 200)
  assert.equal((await app.call('/tasks', { action: 'update', id: taskId, expectedRevision: 1, fields: task })).status, 409)
  assert.equal((await (await app.call()).json()).goals[0].status, 'active')
  assert.equal((await app.call('/goals', { action: 'update', id, expectedRevision: 1, fields: { ...fields, status: 'achieved' } })).status, 400)
  assert.equal((await app.call('/goals', { action: 'update', id, expectedRevision: 1, fields: { ...fields, status: 'paused' } })).status, 200)
  assert.equal((await app.call('/tasks', { action: 'create', id: crypto.randomUUID(), fields: task })).status, 409)
  assert.equal((await app.call('/tasks', { action: 'create', id: crypto.randomUUID(), fields: { ...task, goalId: null } })).status, 200)
  const work = await app.execute('enterprise_work', { kind: 'tasks' })
  assert.equal(work.value.items.length, 1)
  assert.equal(work.value.nextOffset, 1)
  assert.equal((await app.execute('enterprise_work', { kind: 'tasks', offset: 1 })).value.nextOffset, null)
  assert.equal((await app.execute('enterprise_work', { kind: 'tasks', goalId: id })).value.items[0].outcome, 'One buyer confirmed dimensions in the inquiry.')
  assert.equal((await app.execute('enterprise_work', { kind: 'tasks', goalId: crypto.randomUUID() })).isError, true)
  assert.equal((await app.execute('enterprise_work', { kind: 'goals', action: 'complete' })).isError, true)
  assert.equal((await app.call('/goals', { action: 'update', id, expectedRevision: 1, fields })).status, 409)
  assert.equal((await app.call('/goals', { action: 'update', id, expectedRevision: 2, fields: { ...fields, status: 'achieved', outcome: 'Both buyers confirmed fit; written responses retained in company assets.' } })).status, 200)
  assert.equal((await app.call('/goals', { action: 'archive', id, expectedRevision: 3, archived: true })).status, 200)
  assert.equal((await app.execute('enterprise_work', { kind: 'goals' })).value.total, 0)
  assert.equal((await app.execute('enterprise_work', { kind: 'goals', includeArchived: true })).value.total, 1)
  await app.dispose()
  app = await mount(directory)
  const restored = await (await app.call()).json()
  assert.equal(restored.goals[0].status, 'achieved')
  assert.equal(restored.goals[0].archived, true)
  assert.equal(restored.tasks.find(value => value.id === taskId).goalId, id)
  assert.equal((await (await app.call(`/tasks/history?id=${taskId}`)).json())[1].task.outcome, 'One buyer confirmed dimensions in the inquiry.')
  const audits = await (await app.call('/audit')).json()
  assert.equal(audits.filter(row => row.target === `goal:${id}`).length, 4)
  assert.equal((await app.call('/goals', { action: 'update', id, expectedRevision: 4, fields })).status, 409)
  assert.equal((await app.call('/goals', { action: 'archive', id, expectedRevision: 4, archived: false })).status, 200)
})

test('generation 14 task records and their history migrate without inventing goal outcomes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-goal-upgrade-'))
  let app
  t.after(async () => { await app?.dispose(); await rm(directory, { recursive: true, force: true }) })
  app = await mount(directory)
  await app.dispose(); app = undefined
  const id = crypto.randomUUID()
  const legacy = { id, title: 'Existing completed task', description: '', assignee: '', dueDate: null, status: 'done', revision: 1, archived: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
  const db = new DatabaseSync(join(directory, 'enterprise.sqlite'))
  try {
    db.exec('DROP TABLE enterprise_goals; PRAGMA user_version=14;')
    db.prepare('INSERT INTO enterprise_tasks(id,data) VALUES(?,?)').run(id, JSON.stringify(legacy))
    db.prepare('INSERT INTO enterprise_task_history(task_id,revision,data) VALUES(?,?,?)').run(id, 1, JSON.stringify({ action: 'create', actor: 'shared_host', task: legacy }))
  } finally { db.close() }
  app = await mount(directory)
  const data = await (await app.call()).json()
  assert.deepEqual(data.goals, [])
  assert.deepEqual(data.tasks[0], { ...legacy, goalId: null, outcome: '' })
  assert.deepEqual((await (await app.call(`/tasks/history?id=${id}`)).json())[0].task, data.tasks[0])
})

test('profile, verified images, rename, ranges, restart, and logo deletion preserve records', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-storage-'))
  let app = await mount(directory)
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  assert.equal((await (await app.call()).json()).profile, null)
  assert.equal((await app.call('/profile', profile)).status, 200)
  const uploaded = await app.call('/upload', png, { 'x-file-name': encodeURIComponent('产品.png'), 'content-type': 'application/octet-stream' })
  assert.equal(uploaded.status, 201)
  const [asset] = (await uploaded.json()).files
  assert.equal(asset.mime, 'image/png')
  assert.equal(asset.category, 'image')
  assert.equal((await app.call('/profile', { ...profile, logoId: asset.id })).status, 200)
  assert.equal((await app.call('/rename', { id: asset.id, name: 'Catalog.png' })).status, 200)
  const range = await app.fetch(new Request(`http://localhost/api/enterprise/file?id=${asset.id}`, { headers: { range: 'bytes=0-7' } }))
  assert.equal(range.status, 206)
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), png.subarray(0, 8))
  const suffix = await app.fetch(new Request(`http://localhost/api/enterprise/file?id=${asset.id}`, { headers: { range: 'bytes=-4' } }))
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), png.subarray(-4))
  assert.equal((await app.fetch(new Request(`http://localhost/api/enterprise/file?id=${asset.id}`, { headers: { range: 'bytes=9000-' } }))).status, 416)
  await app.dispose()
  app = await mount(directory)
  const recovered = await (await app.call()).json()
  assert.equal(recovered.profile.logoId, asset.id)
  assert.equal(recovered.files[0].name, 'Catalog.png')
  const file = await app.call(`/file?id=${asset.id}&download=1`)
  assert.match(file.headers.get('content-disposition'), /^attachment;/)
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
  const deleted = await (await app.call('/delete', { id: asset.id })).json()
  assert.equal(deleted.profile.logoId, null)
  assert.deepEqual(deleted.files, [])
  assert.equal((await app.call(`/file?id=${asset.id}`)).status, 404)
  assert.deepEqual(await readdir(join(directory, 'files')), [])
})

test('rejects invalid records, paths, unsupported files, and oversized streams without receipts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-rejections-'))
  const app = await mount(directory)
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  assert.equal((await app.call('/profile', { ...profile, name: '' })).status, 400)
  assert.equal((await app.call('/profile', { ...profile, website: 'javascript:alert(1)' })).status, 400)
  assert.equal((await app.call('/profile', { ...profile, email: 'invalid' })).status, 400)
  await app.call('/profile', profile)
  assert.equal((await app.call('/upload', png, { 'x-file-name': '..%2Flogo.png' })).status, 400)
  assert.equal((await app.call('/upload', '<script>bad</script>', { 'x-file-name': 'fake.png', 'content-type': 'image/png' })).status, 415)
  assert.equal((await app.call('/upload', Buffer.alloc(2000), { 'x-file-name': 'large.png' })).status, 413)
  assert.equal((await app.call('/upload', '', { 'x-file-name': 'empty.txt' })).status, 400)
  assert.equal((await app.call('/rename', { id: '../../elsewhere', name: 'bad' })).status, 400)
  assert.deepEqual((await (await app.call()).json()).files, [])
  assert.deepEqual(await readdir(join(directory, 'files')), [])
})

test('extracts Office text and returns cited results through the real tool runtime', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-knowledge-'))
  const app = await mount(directory, { maxFileBytes: 4096, maxTotalBytes: 8192 })
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  await app.call('/profile', profile)
  const uploaded = await app.call('/upload', docx, { 'x-file-name': encodeURIComponent('Capabilities.docx') })
  assert.equal(uploaded.status, 201)
  assert.equal((await uploaded.json()).files[0].knowledgeStatus, 'ready')
  const result = await app.search('renewable energy')
  assert.equal(result.isError, false)
  assert.equal(result.value.profile.citation, '[企业档案]')
  assert.equal(result.value.matches[0].citation, '[资料: Capabilities.docx#片段1]')
  assert.match(result.content[0].text, /Precision export components/)
  const match = result.value.matches[0]
  const passage = await app.execute('enterprise_document_read', { fileId: match.fileId, chunk: match.chunk })
  assert.equal(passage.isError, false)
  assert.equal(passage.value.content, match.content)
  assert.equal(JSON.parse(passage.content[0].text).citation, match.citation)
  const supplier = await app.execute('enterprise_supplier_query', {})
  assert.equal(supplier.isError, false)
  assert.deepEqual(supplier.value.records, [])
})

test('migrates version-one records and indexes existing text without inventing a submission time', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-migration-'))
  await mkdir(join(directory, 'files'))
  const id = 'a7ce4e04-d2a9-4dad-8f5c-ff98a4bd39bc'
  const legacyText = 'Established export workflow'
  const legacy = { id, name: 'Legacy notes.txt', mime: 'text/plain', size: Buffer.byteLength(legacyText), createdAt: '2026-09-14T00:00:00.000Z', category: 'document' }
  await writeFile(join(directory, 'files', id), legacyText)
  const db = new DatabaseSync(join(directory, 'enterprise.sqlite'))
  db.exec('CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE files (id TEXT PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version=1;')
  db.prepare('INSERT INTO profile(id,data) VALUES(1,?)').run(JSON.stringify(profile))
  db.prepare('INSERT INTO files(id,data) VALUES(?,?)').run(id, JSON.stringify(legacy))
  db.close()
  const app = await mount(directory)
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  const snapshotResponse = await app.call()
  assert.equal(snapshotResponse.status, 200, await snapshotResponse.clone().text())
  const snapshot = await snapshotResponse.json()
  assert.equal(snapshot.submittedAt, null)
  assert.equal(snapshot.files[0].knowledgeStatus, 'ready')
  const result = await app.search('export workflow')
  assert.equal(result.value.profile, null)
  assert.equal(result.value.matches[0].citation, '[资料: Legacy notes.txt#片段1]')
  const resubmitted = await (await app.call('/profile', profile)).json()
  assert.match(resubmitted.submittedAt, /^\d{4}-/)
})

test('site editor stores revisions and restores them through the compiled authenticated carrier', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-site-editor-'))
  let app = await mount(directory, { publicBaseUrl: 'https://store.example' })
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  const headers = { 'content-type': 'application/json' }
  const denied = await app.call('/sites', { name: 'Demo', connectionId: 'missing' }, headers)
  assert.equal(denied.status, 403)
  const connection = await app.call('/shopify/stores', { id: 'store', mode: 'managed', shopDomain: 'example.myshopify.com', status: 'connected' }, headers)
  assert.equal(connection.status, 201)
  const response = await app.call('/sites', { name: 'Demo', connectionId: 'store' }, headers)
  assert.equal(response.status, 201)
  const site = await response.json()
  const revisionResponse = await app.call(`/sites?siteId=${site.id}&action=revisions`, { changeSet: { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Editor test' }] } }, headers)
  assert.equal(revisionResponse.status, 201)
  const revision = await revisionResponse.json()
  const preview = await app.call(`/sites?siteId=${site.id}&action=preview&revisionId=${revision.id}&pageId=home`)
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(await preview.text(), /Editor test/)
  await app.dispose()
  app = await mount(directory, { publicBaseUrl: 'https://store.example' })
  const restored = await (await app.call(`/sites?siteId=${site.id}&action=revisions`)).json()
  assert.equal(restored.items[0].id, revision.id)
})

test('disposal aborts an active upload and leaves no receipt or temporary file', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-abort-'))
  const app = await mount(directory)
  t.after(async () => { await app.dispose(); await rm(directory, { recursive: true, force: true }) })
  await app.call('/profile', profile)
  let consumed
  const started = new Promise(resolve => { consumed = resolve })
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(png); consumed(); return new Promise(() => {}) } })
  const uploading = app.call('/upload', stream, { 'x-file-name': 'interrupted.png' })
  await started
  const competing = await app.call('/upload', png, { 'x-file-name': 'other.png' })
  assert.equal(competing.status, 409)
  await app.dispose()
  await uploading
  assert.deepEqual(await readdir(join(directory, 'files')), [])
})
