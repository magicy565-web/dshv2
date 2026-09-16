import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../lib/index.js'
import { productFixture } from './geo-fixture.mjs'

const profile = {
  name: 'Acme Export',
  kind: 'enterprise',
  description: 'Test profile',
  business: 'Industrial parts',
  website: 'https://example.com',
  contact: 'Ada',
  email: 'ada@example.com',
  phone: '+1 555 0100',
  address: 'Test address',
  logoId: null,
}
const limits = {
  maxFileBytes: 1024,
  maxTotalBytes: 2048,
  maxExtractedCharacters: 10000,
  knowledgeChunkCharacters: 512,
  maxKnowledgeResults: 5,
  maxDecompressedBytes: 1048576,
  maxArchiveEntries: 100,
  maxTableCells: 1000,
}

async function mount(directory, overrides = {}) {
  const routes = new Map()
  let activate
  let tool
  const tools = new Map()
  const skills = new Map()
  const listeners = new Map()
  let answer = { answers: [{ id: 'geo-review', selected: ['确认'] }] }
  let review
  let attachments
  const ctx = {
    webServer: {
      register(route) {
        assert.ok(!route.path.startsWith('/api/'), 'public routes use the Web server')
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
    connection: {
      fetch: {
        register(route) {
          assert.ok(route.path.startsWith('/api/'), 'connection routes must use the API namespace')
          assert.ok(!routes.has(route.path), 'each API path must be registered once')
          routes.set(route.path, route)
          return async () => { routes.delete(route.path) }
        },
      },
    },
    systemPrompt: {
      getSectionOrder: () => 10000,
      section: () => () => {},
    },
    tools: { register(definition) { tools.set(definition.name, definition); if (definition.name === 'enterprise_search') tool = definition; return () => tools.delete(definition.name) } },
    skills: { register(skill) { skills.set(skill.name, skill); return () => skills.delete(skill.name) } },
    get: name => name === 'attachments' ? attachments : name === 'userQuestions' ? { ask: async request => { review = request; return typeof answer === 'function' ? answer(request) : answer } } : undefined,
    effect(callback) { activate = callback },
    on(name, callback) { listeners.set(name, callback); return () => listeners.delete(name) },
  }
  apply(ctx, { directory, ...limits, ...overrides })
  assert.ok(activate)
  const dispose = await activate()
  const request = async (path, init) => {
    const url = new URL(`http://localhost/api/enterprise${path}`)
    const route = routes.get(url.pathname)
    assert.ok(route, `route ${path} is registered`)
    return route.fetch(new Request(url, init))
  }
  return { dispose, request, routes, tool, tools, skills, listeners, setAttachments: value => { attachments = value }, setAnswer: value => { answer = value }, getReview: () => review }
}

test('structured products need a separate human verification before authenticated preview', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-product-review-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true }) })
  harness = await mount(directory)
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'product-session' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const id = crypto.randomUUID()
  const product = productFixture()
  product.claims[0].value.unit = 'GSM'
  const fields = { kind: 'product', name: 'R-821', description: 'Printed fabric', sections: [{ label: 'Material', content: 'Viscose', source: 'Catalog page 4' }], questions: '', product }
  const first = await call('enterprise_geo_draft', { id, expectedRevision: 0, fields })
  assert.deepEqual(await call('enterprise_geo_draft', { id, expectedRevision: 0, fields }), first)
  await assert.rejects(call('enterprise_geo_draft', { id, expectedRevision: 1, fields: { ...fields, productVerifiedAt: new Date().toISOString() } }))
  await call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' })
  assert.match(harness.getReview().questions[0].detail, /fabric_weight/)
  assert.equal((await harness.request(`/products/preview?id=${id}`)).status, 409)
  assert.equal((await (await harness.request(`/products/readiness?id=${id}`)).json()).layers.evidence, 'PARTIAL')
  harness.setAnswer({ answers: [{ id: 'geo-verify', selected: ['需要修改'] }] })
  assert.deepEqual(await call('enterprise_geo_verify', { id, expectedRevision: 2, language: 'zh' }), { verified: false })
  harness.setAnswer({ answers: [{ id: 'geo-verify', selected: ['确认'] }] })
  const verified = await call('enterprise_geo_verify', { id, expectedRevision: 2, language: 'zh' })
  assert.equal(verified.revision, 3)
  assert.equal(verified.publicationStatus, 'not_published')
  const preview = await harness.request(verified.previewUrl.replace('/api/enterprise', ''))
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('cache-control'), 'no-store')
  assert.equal(preview.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(await preview.text(), /120 g\/m²/)
  const jsonLd = await (await harness.request(`/products/preview?id=${id}&format=jsonld`)).json()
  assert.equal(jsonLd.name, 'R-821')
  assert.equal(jsonLd.additionalProperty[0].value, '120 g/m²')
  const status = await call('enterprise_geo_status', {})
  assert.equal(status.productReadiness[0].layers.evidence, 'READY')
  assert.equal(status.productReadiness[0].layers.discovery, 'PARTIAL')
  await assert.rejects(call('enterprise_geo_verify', { id, expectedRevision: 2, language: 'zh' }), /geoConflict/)
  await harness.dispose()
  harness = await mount(directory)
  assert.equal((await harness.request(`/products/preview?id=${id}`)).status, 200)
  const replacement = crypto.randomUUID()
  await call('enterprise_geo_draft', { id: replacement, expectedRevision: 0, fields, supersedesId: id })
  assert.equal((await harness.request(`/products/preview?id=${replacement}`)).status, 409)
})

test('a stale fact-verification answer cannot replace another verification receipt', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-product-stale-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true }) })
  harness = await mount(directory)
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'product-session' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const id = crypto.randomUUID()
  await call('enterprise_geo_draft', { id, expectedRevision: 0, fields: { kind: 'product', name: 'R-821', description: 'Printed fabric', sections: [{ label: 'Source', content: 'Fabric', source: 'Catalog' }], questions: '', product: productFixture() } })
  await call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' })
  let release, reached
  const pending = new Promise(resolve => { release = resolve })
  const waiting = new Promise(resolve => { reached = resolve })
  harness.setAnswer(() => { reached(); return pending })
  const stale = call('enterprise_geo_verify', { id, expectedRevision: 2, language: 'zh' })
  await waiting
  harness.setAnswer({ answers: [{ id: 'geo-verify', selected: ['确认'] }] })
  await call('enterprise_geo_verify', { id, expectedRevision: 2, language: 'zh' })
  release({ answers: [{ id: 'geo-verify', selected: ['确认'] }] })
  await assert.rejects(stale, /geoConflict/)
})

test('chat skill persists dynamic drafts and confirms only through the human answer channel', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-chat-onboarding-'))
  let harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'session-onboarding' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  assert.equal(harness.skills.get('product-geo').invocation.userInvocable, true)
  assert.match(harness.skills.get('product-geo').content, /Never send the user to a form/)
  const skillContracts = {
    'overseas-buyer-research': /Do not send messages/,
    'supplier-evaluation': /Do not call a supplier trusted/,
    'product-profitability': /Do not authorize spend/,
    'brand-positioning': /Do not publish ads/,
    'inquiry-response': /Do not send messages/,
  }
  for (const [name, contract] of Object.entries(skillContracts)) {
    assert.equal(harness.skills.get(name).invocation.modelInvocable, true)
    assert.equal(harness.skills.get(name).invocation.userInvocable, true)
    assert.match(harness.skills.get(name).content, contract)
  }
  assert.equal((await call('enterprise_geo_status', {})).company, 'missing')
  const id = crypto.randomUUID()
  const fields = { kind: 'company', name: 'Weave Studio', description: 'Printed fabric for clothing designers.', sections: [{ label: 'Who we serve', content: 'Clothing designers', source: 'User: we supply clothing designers.' }], questions: 'Which fabric?' }
  const proposal = { id, expectedRevision: 0, fields }
  const first = await call('enterprise_geo_draft', proposal)
  assert.equal(first.status, 'draft')
  assert.deepEqual(await call('enterprise_geo_draft', proposal), first)
  await assert.rejects(call('enterprise_geo_draft', { ...proposal, workspaceId: 'another' }))
  await assert.rejects(call('enterprise_geo_draft', { ...proposal, confirmed: true }))
  await assert.rejects(call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' }), /geoIncomplete/)
  const resolved = { ...fields, questions: '', sections: [...fields.sections, { label: 'Fabric', content: 'Printed rayon', source: 'User: rayon prints.' }] }
  const second = await call('enterprise_geo_draft', { id, expectedRevision: 1, fields: resolved })
  assert.equal(second.revision, 2)
  await assert.rejects(call('enterprise_geo_draft', { id, expectedRevision: 1, fields }), /geoConflict/)
  harness.setAnswer({ answers: [{ id: 'geo-review', selected: ['需要修改'], custom: 'Please adjust the name' }] })
  assert.equal((await call('enterprise_geo_review', { id, expectedRevision: 2, language: 'zh' })).status, 'draft')
  assert.equal((await (await harness.request('')).json()).profile, null)
  harness.setAnswer({ answers: [{ id: 'geo-review', selected: ['确认'] }] })
  assert.equal((await call('enterprise_geo_review', { id, expectedRevision: 2, language: 'zh' })).status, 'confirmed')
  assert.match(harness.getReview().questions[0].detail, /Printed rayon/)
  assert.equal((await call('enterprise_geo_status', {})).company, 'confirmed')
  assert.equal((await call('enterprise_geo_status', {})).products, 'missing')
  assert.equal((await (await harness.request('')).json()).profile.name, fields.name)
  await assert.rejects(call('enterprise_geo_draft', { id, expectedRevision: 3, fields }), /geoConflict/)
  assert.equal(harness.routes.has('/api/enterprise/geo'), false)
  await harness.dispose()
  assert.equal(harness.skills.size, 0)
  harness = await mount(directory)
  assert.equal((await call('enterprise_geo_status', {})).records[0].status, 'confirmed')
})

test('review cannot approve a draft changed while the human is reading it', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-chat-review-'))
  const harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'review-session' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const id = crypto.randomUUID()
  const fields = { kind: 'product', name: 'Rayon', description: 'Printed fabric', sections: [{ label: 'Material', content: 'Rayon', source: 'User statement' }], questions: '' }
  await call('enterprise_geo_draft', { id, expectedRevision: 0, fields })
  let release
  let reached
  const pending = new Promise(resolve => { release = resolve })
  const reviewing = new Promise(resolve => { reached = resolve })
  harness.setAnswer(() => { reached(); return pending })
  const review = call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' })
  await reviewing
  await call('enterprise_geo_draft', { id, expectedRevision: 1, fields: { ...fields, name: 'Revised fabric' } })
  release({ answers: [{ id: 'geo-review', selected: ['确认'] }] })
  await assert.rejects(review, /geoConflict/)
  assert.equal((await call('enterprise_geo_status', {})).records[0].status, 'draft')
})

test('persists conversation binding and rejects stale binding updates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-binding-'))
  let harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const bind = (sessionId, expectedRevision) => harness.request('/onboarding/session', { method: 'POST', body: JSON.stringify({ sessionId, expectedRevision }) })
  assert.equal((await bind('first-chat', 0)).status, 200)
  assert.equal((await bind('stale-chat', 0)).status, 409)
  await harness.dispose()
  harness = await mount(directory)
  assert.equal((await (await harness.request('')).json()).onboarding.sessionId, 'first-chat')
  assert.equal(harness.tools.has('enterprise_save_profile'), false)
  const policy = harness.listeners.get('tools/pre-execute')
  assert.equal((await policy({ name: 'bash', agent: { session: { id: 'first-chat' } } }, async () => ({ kind: 'allow' }))).kind, 'deny')
  assert.equal((await policy({ name: 'enterprise_geo_status', agent: { session: { id: 'first-chat' } } }, async () => ({ kind: 'allow' }))).kind, 'allow')
  assert.equal((await policy({ name: 'bash', agent: { session: { id: 'ordinary-chat', snapshotEvents: () => [] } } }, async () => ({ kind: 'allow' }))).kind, 'allow')
})

test('chat file lookup rejects paths and attachments absent from the calling conversation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-chat-files-'))
  const harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const tool = harness.tools.get('enterprise_chat_files')
  const exec = { signal: new AbortController().signal, agent: { session: { snapshotEvents: () => [] } } }
  assert.deepEqual(await tool.execute({}, exec), { files: [] })
  await assert.rejects(tool.execute({ path: 'C:/private.txt' }, exec))
  await assert.rejects(tool.execute({ attachmentId: 'other-conversation-file' }, exec), /missing/)
  const path = join(directory, 'catalog.txt')
  const content = 'Rayon prints for clothing designers. No price has been provided.'
  await writeFile(path, content)
  const ref = { attachmentId: 'catalog-id', name: 'catalog.txt', bytes: Buffer.byteLength(content) }
  let verified = false
  harness.setAttachments({ async *readFileStream(value) { assert.deepEqual(value, ref); yield Buffer.from(content); verified = true }, fileHostPath() { assert.equal(verified, true); return path } })
  const chat = { ...exec, agent: { session: { snapshotEvents: () => [{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'file', attachment: ref }] } }] } } }
  assert.deepEqual(await tool.execute({}, chat), { files: [ref] })
  assert.deepEqual(await tool.execute({ attachmentId: ref.attachmentId }, chat), { name: 'catalog.txt', chunks: [{ content, citation: '[Chat: catalog.txt#1]' }] })
})

test('revisions retain confirmed history and completion requires an exact human-reviewed scope', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-scope-'))
  const harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'scope-chat' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const id = crypto.randomUUID()
  const fields = { kind: 'product', name: 'Fabric', description: 'Rayon prints', sections: [{ label: 'Material', content: 'Rayon', source: 'User statement' }], questions: '' }
  await call('enterprise_geo_draft', { id, expectedRevision: 0, fields })
  await assert.rejects(call('enterprise_geo_finish', { ids: [id], language: 'zh' }), /geoIncomplete/)
  await call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' })
  assert.equal((await call('enterprise_geo_status', {})).onboarding.completedAt, null)
  harness.setAnswer({ answers: [{ id: 'geo-finish', selected: ['需要修改'] }] })
  assert.equal((await call('enterprise_geo_finish', { ids: [id], language: 'zh' })).completed, false)
  harness.setAnswer({ answers: [{ id: 'geo-finish', selected: ['确认'] }] })
  assert.equal((await call('enterprise_geo_finish', { ids: [id], language: 'zh' })).completed, true)
  const replacement = crypto.randomUUID()
  await call('enterprise_geo_draft', { id: replacement, expectedRevision: 0, fields: { ...fields, description: 'New description' }, supersedesId: id })
  const pending = await call('enterprise_geo_status', {})
  assert.equal(pending.onboarding.completedAt, null)
  assert.equal(pending.records.find(record => record.id === id).description, fields.description)
  await assert.rejects(call('enterprise_geo_draft', { id: crypto.randomUUID(), expectedRevision: 0, fields, supersedesId: id }), /geoConflict/)
  await assert.rejects(call('enterprise_geo_finish', { ids: [id], language: 'zh' }), /geoConflict/)
  harness.setAnswer({ answers: [{ id: 'geo-review', selected: ['确认'] }] })
  await call('enterprise_geo_review', { id: replacement, expectedRevision: 1, language: 'zh' })
  assert.deepEqual((await call('enterprise_geo_status', {})).records.map(record => record.id), [replacement])
  const stored = (await (await harness.request('')).json()).geo
  assert.equal(stored.length, 2)
  assert.equal(stored.find(record => record.id === id).description, fields.description)
})

test('persists an enterprise profile and streams private assets', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-trade-enterprise-'))
  let harness = await mount(directory)
  t.after(async () => {
    await harness.dispose()
    await rm(directory, { recursive: true, force: true })
  })

  let response = await harness.request('/profile', {
    method: 'POST',
    body: JSON.stringify(profile),
    duplex: 'half',
  })
  assert.equal(response.status, 200)
  const submitted = await response.json()
  assert.equal(submitted.profile.name, profile.name)
  assert.equal(submitted.profile.kind, profile.kind)
  assert.equal(submitted.profile.schemaVersion, '1.0')
  assert.ok(submitted.profile.companyEntityId.startsWith('cmp_'))
  assert.match(submitted.submittedAt, /^\d{4}-/)

  response = await harness.request('/upload', {
    method: 'POST',
    headers: { 'content-length': '11', 'x-file-name': encodeURIComponent('notes.txt') },
    body: 'hello world',
    duplex: 'half',
  })
  assert.equal(response.status, 201)
  const uploaded = await response.json()
  assert.equal(uploaded.files.length, 1)
  const asset = uploaded.files[0]
  assert.equal(asset.name, 'notes.txt')
  assert.equal(asset.mime, 'text/plain')
  assert.equal(asset.knowledgeStatus, 'ready')
  assert.equal(await readFile(join(directory, 'files', asset.id), 'utf8'), 'hello world')

  const searched = await harness.tool.execute({ query: 'hello' }, { signal: new AbortController().signal })
  assert.equal(searched.profile.citation, '[企业档案]')
  assert.equal(searched.matches[0].citation, '[资料: notes.txt#片段1]')
  assert.equal(searched.matches[0].content, 'hello world')

  response = await harness.request(`/file?id=${asset.id}`, { headers: { range: 'bytes=6-10' } })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 6-10/11')
  assert.equal(await response.text(), 'world')

  response = await harness.request('/rename', {
    method: 'POST',
    body: JSON.stringify({ id: asset.id, name: 'renamed.txt' }),
    duplex: 'half',
  })
  assert.equal((await response.json()).files[0].name, 'renamed.txt')

  await harness.dispose()
  assert.equal(harness.routes.size, 0)
  harness = await mount(directory)
  response = await harness.request('')
  const reopened = await response.json()
  assert.equal(reopened.profile.name, profile.name)
  assert.equal(reopened.profile.schemaVersion, '1.0')
  assert.equal(reopened.files[0].name, 'renamed.txt')

  response = await harness.request('/delete', {
    method: 'POST',
    body: JSON.stringify({ id: asset.id }),
    duplex: 'half',
  })
  assert.equal((await response.json()).files.length, 0)
  assert.deepEqual((await harness.tool.execute({ query: 'hello' }, { signal: new AbortController().signal })).matches, [])
})

test('creates task revisions and rejects stale updates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-trade-enterprise-tasks-'))
  const harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  await harness.request('/profile', { method: 'POST', body: JSON.stringify(profile), duplex: 'half' })
  const id = crypto.randomUUID()
  const fields = { title: 'Approve catalog', description: 'Review the draft', assignee: 'Ada', dueDate: '2030-01-02', status: 'todo' }
  let response = await harness.request('/tasks', { method: 'POST', body: JSON.stringify({ action: 'create', id, fields }), duplex: 'half' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).tasks[0].revision, 1)
  response = await harness.request('/tasks', { method: 'POST', body: JSON.stringify({ action: 'update', id, expectedRevision: 1, fields: { ...fields, status: 'done' } }), duplex: 'half' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).tasks[0].status, 'done')
  response = await harness.request('/tasks', { method: 'POST', body: JSON.stringify({ action: 'update', id, expectedRevision: 1, fields }), duplex: 'half' })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error, 'taskConflict')
  response = await harness.request(`/tasks/history?id=${id}`)
  assert.equal((await response.json()).length, 2)
})

test('validates an entire UTF-8 text upload instead of accepting only its prefix', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-trade-enterprise-utf8-'))
  const harness = await mount(directory, { maxFileBytes: 16384, maxTotalBytes: 32768 })
  t.after(async () => {
    await harness.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  await harness.request('/profile', { method: 'POST', body: JSON.stringify(profile), duplex: 'half' })
  const response = await harness.request('/upload', {
    method: 'POST',
    headers: { 'x-file-name': 'invalid.txt' },
    body: Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0xff])]),
    duplex: 'half',
  })
  assert.equal(response.status, 415)
  assert.deepEqual((await (await harness.request('')).json()).files, [])
})

test('registers the site editor on one valid authenticated connection route', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-trade-enterprise-site-route-'))
  const harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  assert.ok(harness.routes.has('/api/enterprise/sites'))
  assert.equal([...harness.routes.keys()].some(path => path.includes(':id')), false)
})
