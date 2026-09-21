import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, Config } from '../lib/index.js'
import { productFixture } from './geo-fixture.mjs'
import { supplierFixture } from './supplier-fixture.mjs'
import { Context } from '@deepseek-ai/cordis'
import { Readable } from 'node:stream'

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
  maxSourceFiles: 1000,
  maxFileBytes: 1024,
  maxTotalBytes: 2048,
  maxExtractedCharacters: 10000,
  knowledgeChunkCharacters: 512,
  maxKnowledgeResults: 5,
  maxDecompressedBytes: 1048576,
  maxArchiveEntries: 100,
  maxTableCells: 1000,
}

test('folder onboarding inventories every file, persists reading and requires source coverage before scope confirmation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-folder-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
  harness = await mount(directory, { maxFileBytes: 20000, maxTotalBytes: 50000, maxKnowledgeResults: 1, maxSourceFiles: 3 })
  const post = async (path, data) => harness.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'folder-session' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const content = 'Acme manufactures industrial parts. Product AX-1 uses steel and serves equipment buyers.\n'.repeat(16)
  const id = crypto.randomUUID(), path = 'Acme/products/catalog.txt'
  const manifest = { id, files: [{ path, size: Buffer.byteLength(content) }, { path: 'Acme/.env', size: 30 }, { path: 'Acme/archive.exe', size: 10 }] }
  assert.equal((await post('/sources/import', manifest)).status, 200)
  assert.equal((await post('/sources/import', manifest)).status, 200)
  assert.equal((await post('/sources/import', { ...manifest, files: [{ path: '../escape.txt', size: 10 }] })).status, 400)
  assert.equal((await post('/sources/import', { id: crypto.randomUUID(), files: Array.from({ length: 4 }, (_, i) => ({ path: `Excess/${i}.txt`, size: 10 })) })).status, 413)
  assert.equal((await post('/sources/import', { id: crypto.randomUUID(), files: [manifest.files[0], manifest.files[0]] })).status, 400)
  assert.equal((await harness.request(`/sources/upload?${new URLSearchParams({ importId: id, path: 'Acme/.env' })}`, { method: 'POST', headers: { 'x-file-name': '.env' }, body: 'secret' })).status, 400)
  const upload = () => harness.request(`/sources/upload?${new URLSearchParams({ importId: id, path })}`, { method: 'POST', headers: { 'x-file-name': 'catalog.txt' }, body: content })
  assert.equal((await upload()).status, 201)
  assert.equal((await upload()).status, 200)
  const stored = await (await harness.request('')).json()
  assert.equal(stored.files.length, 1)
  assert.equal(stored.profile, null)
  assert.deepEqual(stored.files[0].source, { importId: id, path })
  assert.deepEqual(stored.imports[0].files.map(file => file.status), ['imported', 'skipped', 'skipped'])
  const first = await call('enterprise_sources', { action: 'list' })
  assert.equal(first.total, 3)
  assert.equal(first.nextOffset, 1)
  const fileId = first.files[0].fileId
  const assessment = { action: 'assess', importId: id, path, disposition: 'used', reason: 'Company identity and AX-1 specifications.' }
  await assert.rejects(call('enterprise_sources', assessment), /sourceUnread/)
  let nextChunk = 1, citations = []
  do {
    const page = await call('enterprise_sources', { action: 'read', fileId, chunk: nextChunk })
    citations.push(...page.chunks.map(chunk => chunk.citation))
    nextChunk = page.nextChunk
  } while (nextChunk !== null)
  await harness.dispose()
  harness = await mount(directory, { maxFileBytes: 20000, maxTotalBytes: 50000, maxKnowledgeResults: 1 })
  assert.equal((await call('enterprise_sources', { action: 'list' })).files[0].readChunks.length, citations.length)
  const ids = []
  for (const kind of ['company', 'product']) {
    const recordId = crypto.randomUUID(); ids.push(recordId)
    await call('enterprise_geo_draft', { id: recordId, expectedRevision: 0, fields: { kind, name: kind === 'company' ? 'Acme' : 'AX-1', description: 'Industrial parts', sections: [{ label: 'Business', content: 'Manufactures steel parts', source: citations[0] }], questions: '' } })
    assert.deepEqual((await (await harness.request('')).json()).geo.find(record => record.id === recordId).assetIds, [fileId])
    await call('enterprise_geo_review', { id: recordId, expectedRevision: 1, language: 'zh' })
    assert.equal(harness.getReview().questions[0].question, kind === 'company' ? '请确认企业资料草稿是否准确。' : '请确认产品资料草稿是否准确。')
  }
  await assert.rejects(call('enterprise_geo_finish', { ids, language: 'zh' }), /sourceUnread/)
  await call('enterprise_sources', assessment)
  harness.setAnswer(async () => {
    await call('enterprise_sources', { ...assessment, disposition: 'excluded', reason: 'Changed scope while confirmation was open' })
    return { answers: [{ id: 'geo-finish', selected: ['确认'] }] }
  })
  await assert.rejects(call('enterprise_geo_finish', { ids, language: 'zh' }), /geoConflict/)
  await call('enterprise_sources', assessment)
  harness.setAnswer({ answers: [{ id: 'geo-finish', selected: ['确认'] }] })
  assert.equal((await call('enterprise_geo_finish', { ids, language: 'zh' })).completed, true)
  assert.match(harness.getReview().questions[0].detail, /Acme\/\.env/)
  assert.equal((await (await harness.request('')).json()).profile.name, 'Acme')
  await post('/sources/import', { id: crypto.randomUUID(), files: [{ path: 'Extra/notes.txt', size: 5 }] })
  assert.equal((await (await harness.request('')).json()).onboarding.completedAt, null)
  await assert.rejects(call('enterprise_geo_finish', { ids, language: 'zh' }), /sourceUnread/)
})

test('folder retries preserve completed uploads and truncated or deleted sources cannot count as fully read', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-folder-retry-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
  harness = await mount(directory, { maxExtractedCharacters: 512, knowledgeChunkCharacters: 512 })
  const post = (path, data) => harness.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const id = crypto.randomUUID(), path = 'Acme/large.txt', body = 'x'.repeat(800)
  const exec = { signal: new AbortController().signal }
  const source = args => harness.tools.get('enterprise_sources').execute(args, exec)
  await post('/sources/import', { id, files: [{ path, size: 800 }] })
  const endpoint = `/sources/upload?${new URLSearchParams({ importId: id, path })}`
  assert.equal((await harness.request(endpoint, { method: 'POST', headers: { 'x-file-name': 'large.txt' }, body: 'short' })).status, 400)
  assert.equal((await (await harness.request('')).json()).imports[0].files[0].status, 'failed')
  assert.equal((await harness.request(endpoint, { method: 'POST', headers: { 'x-file-name': 'wrong.txt' }, body })).status, 400)
  assert.equal((await harness.request(endpoint, { method: 'POST', headers: { 'x-file-name': 'large.txt' }, body })).status, 201)
  const file = (await source({ action: 'list' })).files[0]
  assert.equal(file.textTruncated, true)
  assert.equal((await source({ action: 'read', fileId: file.fileId })).textTruncated, true)
  await assert.rejects(source({ action: 'assess', importId: id, path, disposition: 'used', reason: 'Read prefix' }), /sourceTruncated/)
  await source({ action: 'assess', importId: id, path, disposition: 'needs_input', reason: 'Please provide smaller documents' })
  assert.equal((await post('/delete', { id: file.fileId })).status, 200)
  const missing = (await source({ action: 'list' })).files[0]
  assert.equal(missing.missing, true)
  assert.equal(missing.assessment, null)
  await assert.rejects(source({ action: 'read', fileId: file.fileId }), /missing/)
})

test('product workspace retains confirmed versions, rejects stale edits and shares archived state with Agent reads', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-products-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
  harness = await mount(directory)
  const post = (path, data) => harness.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const id = crypto.randomUUID(), fields = { kind: 'product', name: 'AX-1', description: 'Steel part', sections: [{ label: 'Material', content: 'Steel', source: 'User declaration' }], questions: '' }
  assert.equal((await post('/products/draft', { id, expectedRevision: 0, fields: { ...fields, assetIds: [crypto.randomUUID()] } })).status, 404)
  assert.equal((await post('/products/draft', { id, expectedRevision: 0, fields })).status, 200)
  assert.equal((await post('/products/confirm', { id, expectedRevision: 1 })).status, 200)
  assert.equal((await post('/products/draft', { id, expectedRevision: 2, fields: { ...fields, name: 'Changed' } })).status, 409)
  const successor = crypto.randomUUID()
  assert.equal((await post('/products/draft', { id: successor, expectedRevision: 0, supersedesId: id, fields: { ...fields, description: 'Revised steel part' } })).status, 200)
  assert.equal((await post('/products/confirm', { id: successor, expectedRevision: 9 })).status, 409)
  assert.equal((await post('/products/confirm', { id: successor, expectedRevision: 1 })).status, 200)
  assert.equal((await post('/products/archive', { id: successor, expectedRevision: 2, archived: true })).status, 200)
  const status = await harness.tools.get('enterprise_geo_status').execute({}, { signal: new AbortController().signal })
  assert.equal(status.records.length, 0)
  await harness.dispose(); harness = await mount(directory)
  const records = (await (await harness.request('')).json()).geo
  assert.equal(records.find(record => record.id === id).description, 'Steel part')
  assert.ok(records.find(record => record.id === successor).archivedAt)
  assert.equal((await post('/products/archive', { id: successor, expectedRevision: 3, archived: false })).status, 200)
})

test('archived verified products cannot be previewed, verified or published', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-product-archive-'))
  const harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'product-archive-session' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const id = crypto.randomUUID()
  await call('enterprise_geo_draft', { id, expectedRevision: 0, fields: { kind: 'product', name: 'R-821', description: 'Printed fabric', sections: [{ label: 'Material', content: 'Viscose', source: 'Catalog page 4' }], questions: '', product: productFixture() } })
  await call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' })
  harness.setAnswer({ answers: [{ id: 'geo-verify', selected: ['确认'] }] })
  await call('enterprise_geo_verify', { id, expectedRevision: 2, language: 'zh' })
  assert.equal((await harness.request('/products/archive', { method: 'POST', body: JSON.stringify({ id, expectedRevision: 3, archived: true }) })).status, 200)
  assert.equal((await harness.request(`/products/preview?id=${id}`)).status, 409)
  assert.equal((await harness.request(`/products/readiness?id=${id}`)).status, 404)
  await assert.rejects(call('enterprise_geo_verify', { id, expectedRevision: 4, language: 'zh' }), /geoConflict/)
  await assert.rejects(call('enterprise_site_publish', { id, slug: 'archived' }), /geoIncomplete/)
  await assert.rejects(call('enterprise_shopify_sync', { id, connectionId: 'unused', handle: 'archived' }), /geoIncomplete/)
})

test('commerce routes reuse the existing Host and request publication scopes only for a bound merchant', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-commerce-host-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true }) })
  harness = await mount(directory, { commerce: { url: 'http://127.0.0.1:3100/', token: 'synthetic-server-bridge-token-only', merchantId: crypto.randomUUID(), timeoutMs: 1000, maxBodyBytes: 10000 }, shopifyClientId: 'fixture-client', shopifyRedirectUri: 'https://example.test/callback' })
  assert.deepEqual(await (await harness.request('/commerce')).json(), { enabled: true, merchantEnabled: true })
  assert.ok(harness.routes.has('/commerce/v1/shopify'))
  assert.ok(harness.routes.has('/api/enterprise/commerce/factory/workspace'))
  assert.ok(harness.routes.has('/api/enterprise/commerce/merchant/commands'))
  assert.ok(!harness.routes.has('/api/enterprise/commerce/merchant/integration/open'))
  const response = await harness.request('/shopify/oauth/start?shop=fixture.myshopify.com')
  assert.equal(response.status, 302)
  const scopes = new URL(response.headers.get('location')).searchParams.get('scope').split(',')
  assert.ok(scopes.includes('write_publications'))
  assert.ok(scopes.includes('read_publications'))
  await harness.dispose()
  harness = await mount(directory, { shopifyClientId: 'fixture-client', shopifyRedirectUri: 'https://example.test/callback' })
  assert.ok(!harness.routes.has('/commerce/v1/shopify'))
  const unchanged = await harness.request('/shopify/oauth/start?shop=fixture.myshopify.com')
  assert.deepEqual(new URL(unchanged.headers.get('location')).searchParams.get('scope').split(','), ['write_products', 'read_products'])
})

async function mount(directory, overrides = {}) {
  const services = new Context()
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
    reflect: services.reflect,
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
  apply(ctx, Config.parse({ directory, ...limits, ...overrides }))
  assert.ok(activate)
  const stop = await activate()
  let disposal
  const dispose = () => disposal ??= (async () => { await stop(); await services.fiber.dispose() })()
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

test('reserves one onboarding conversation across concurrent requests and restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-reservation-'))
  let harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const prepare = () => harness.request('/onboarding/prepare', { method: 'POST', body: '{}' })
  const replies = await Promise.all(Array.from({ length: 4 }, prepare))
  const projections = await Promise.all(replies.map(response => response.json()))
  const progress = projections[0].onboarding
  assert.match(progress.sessionId, /^session-/)
  assert.equal(progress.revision, 1)
  for (const projection of projections) assert.deepEqual(projection.onboarding, progress)
  assert.equal((await harness.request('/onboarding/prepare', { method: 'POST', body: '{"sessionId":"override"}' })).status, 400)
  await harness.dispose()
  harness = await mount(directory)
  assert.deepEqual((await (await prepare()).json()).onboarding, progress)
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
  assert.equal((await (await harness.request('/onboarding/prepare', { method: 'POST', body: '{}' })).json()).onboarding.sessionId, 'first-chat')
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
  const fields = { title: 'Approve catalog', description: 'Review the draft', assignee: 'Ada', dueDate: '2030-01-02', status: 'todo', goalId: null, outcome: '' }
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
  assert.ok(harness.tools.has('site_create'))
  const response = await harness.request('/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Independent site' }) })
  assert.equal(response.status, 201)
  assert.equal((await response.json()).connectionId, undefined)
})

test('site tools save a real project, preserve historical versions and reject stale edits', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-trade-site-tools-'))
  const harness = await mount(directory, { maxFileBytes: 16384, maxTotalBytes: 32768 })
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const execute = (name, args) => harness.tools.get(name).execute(args, { signal: new AbortController().signal })
  const site = await execute('site_create', { name: 'Studio website' })
  const html = '<!doctype html><title>Studio</title><button>Click</button><script src="app.js"></script>'
  const first = await execute('site_update_draft', { siteId: site.id, expectedRevisionId: null, framework: 'static', files: [{ path: 'index.html', content: html, encoding: 'utf8' }, { path: 'app.js', content: 'document.querySelector("button").onclick = event => { event.target.textContent = "Clicked" }', encoding: 'utf8' }] })
  const preview = await execute('site_preview', { siteId: site.id, revisionId: first.revisionId })
  const response = await harness.request(preview.previewUrl.replace('/api/enterprise', ''))
  assert.equal(response.status, 200, await response.clone().text())
  assert.match(await response.text(), /<title>Studio<\/title>/)
  assert.match(response.headers.get('content-security-policy'), /sandbox allow-scripts;/)
  await assert.rejects(execute('site_update_draft', { siteId: site.id, expectedRevisionId: null, framework: 'static', files: [] }), /conflict/)
  const second = await execute('site_update_draft', { siteId: site.id, expectedRevisionId: first.revisionId, framework: 'static', files: [{ path: 'styles.css', content: 'body { color: blue }', encoding: 'utf8' }] })
  const restored = await execute('site_rollback', { siteId: site.id, expectedRevisionId: second.revisionId, revisionId: first.revisionId })
  const read = await execute('site_get', { siteId: site.id, revisionId: restored.id })
  assert.equal(read.content.project.files.length, 2)
  assert.equal(read.content.project.files[0].content, html)
  assert.equal(read.revisions.length, 3)
  assert.equal(read.revisions[0].changeSet, undefined)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(harness.tools.get('site_create').execute({ name: 'Cancelled' }, { signal: controller.signal }), /cancelled/)
  await harness.dispose()
  assert.equal(harness.tools.has('site_create'), false)
})

test('site tools retain a manufacturing starter across Host restarts and reject an oversized starter without creating a site', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-trade-manufacturing-'))
  let harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const execution = { signal: new AbortController().signal }
  await assert.rejects(harness.tools.get('site_create').execute({ name: 'Too large', template: { id: 'manufacturing', version: '1.0.0', parameters: {} } }, execution), /exceeds the configured/)
  assert.deepEqual((await harness.tools.get('site_get').execute({}, execution)).items, [])
  await harness.dispose()
  harness = await mount(directory, { maxFileBytes: 1048576, maxTotalBytes: 2097152 })
  const site = await harness.tools.get('site_create').execute({ name: 'Manufacturing sample', template: { id: 'manufacturing', version: '1.0.0', parameters: {} } }, execution)
  assert.ok(site.currentRevisionId)
  await harness.dispose()
  harness = await mount(directory, { maxFileBytes: 1048576, maxTotalBytes: 2097152 })
  const saved = await harness.tools.get('site_get').execute({ siteId: site.id, revisionId: site.currentRevisionId }, execution)
  assert.equal(saved.content.project.files.length, 16)
  assert.equal(saved.revisions.length, 1)
  assert.deepEqual(saved.jobs, [])
  assert.deepEqual(saved.hosting.deployments, [])
  const catalog = await harness.tools.get('site_templates').execute({}, execution)
  assert.ok(catalog.items.some(item => item.id === 'manufacturing' && item.version === '1.0.0'))
  const updated = await harness.tools.get('site_template_update').execute({ siteId: site.id, expectedRevisionId: site.currentRevisionId, parameters: { brandName: 'Acme Motion', style: 'precision' } }, execution)
  const next = await harness.tools.get('site_get').execute({ siteId: site.id, revisionId: updated.revisionId }, execution)
  assert.match(next.content.project.files.find(file => file.path === 'index.html').content, /ACME MOTION/)
  assert.match(next.content.project.files.find(file => file.path === 'index.html').content, /theme-precision/)
  assert.equal(next.revisions.length, 2)
  await assert.rejects(harness.tools.get('site_template_update').execute({ siteId: site.id, expectedRevisionId: site.currentRevisionId, parameters: {} }, execution), /revision conflict/)
  const manual = await harness.tools.get('site_update_draft').execute({ siteId: site.id, expectedRevisionId: updated.revisionId, framework: 'static', files: [{ path: 'manual.css', content: 'body{color:red}', encoding: 'utf8' }] }, execution)
  await assert.rejects(harness.tools.get('site_template_update').execute({ siteId: site.id, expectedRevisionId: manual.revisionId, parameters: { style: 'international' } }, execution), /manual edits/)
  assert.equal((await harness.tools.get('site_get').execute({ siteId: site.id }, execution)).site.currentRevisionId, manual.revisionId)
})

async function supplierSetup(harness) {
  await harness.request('/profile', { method: 'POST', body: JSON.stringify(profile) })
  const response = await harness.request('/upload', { method: 'POST', headers: { 'x-file-name': 'catalog.txt' }, body: 'Custom printed viscose fabrics. Historical sample lead time 7 days. Exact GSM and MOQ need confirmation.' })
  assert.equal(response.status, 201)
  const fileId = (await response.json()).files[0].id
  const fields = { kind: 'company', name: 'Weave Studio', description: 'Apparel fabrics', sections: [{ label: 'Supply', content: 'Custom printed viscose', source: 'Supplier catalog' }], questions: '', supplier: supplierFixture(fileId) }
  return { fileId, fields }
}

async function externalRequest(harness, path, token, method = 'GET', payload) {
  const route = harness.routes.get(new URL(path, 'http://localhost').pathname)
  assert.ok(route, `external route ${path} is registered`)
  let status, headers, body
  const request = Object.assign(Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]), { method, url: path, headers: { authorization: token === undefined ? undefined : `Bearer ${token}` } })
  await route.handler(request, {
    writeHead(value, fields) { status = value; headers = fields },
    end(value) { body = value },
  })
  return { status, headers, data: JSON.parse(body) }
}

test('supplier queries require review, retain unknowns and expiry, and follow confirmed revisions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-supplier-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true }) })
  harness = await mount(directory)
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'supplier-session' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const { fileId, fields } = await supplierSetup(harness)
  fields.supplier.presentation = { focus: 'services', headline: 'Source-backed apparel development', introduction: 'Custom printed viscose fabrics.', sections: ['solution', 'capability'], featuredIds: ['launch'] }
  const id = crypto.randomUUID()
  await call('enterprise_geo_draft', { id, expectedRevision: 0, fields })
  assert.deepEqual((await call('enterprise_supplier_query', {})).records, [])
  await call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' })
  assert.match(harness.getReview().questions[0].detail, /Exact weight needs confirmation/)
  assert.match(harness.getReview().questions[0].detail, /Source-backed apparel development/)
  const query = await call('enterprise_supplier_query', { query: 'viscose' })
  assert.equal(query.records[0].items.length, 2)
  assert.equal(query.records[0].relations[0].type, 'supports')
  assert.equal(query.records[0].items[0].claims[1].status, 'UNKNOWN')
  assert.equal(query.records[0].items[0].claims[2].expired, true)
  assert.equal(query.records[0].evidence[0].availability, 'available')
  assert.equal((await call('enterprise_supplier_query', { kind: 'partner_program' })).records[0].total, 0)
  const found = await call('enterprise_search', { query: 'viscose' })
  assert.equal(found.matches[0].fileId, fileId)
  const passage = await call('enterprise_document_read', { fileId, chunk: 1 })
  assert.equal(passage.content, found.matches[0].content)
  assert.match(passage.contentHash, /^[a-f0-9]{64}$/)
  await assert.rejects(call('enterprise_document_read', { fileId, chunk: 0 }))
  await assert.rejects(call('enterprise_document_read', { fileId, chunk: 999 }), /missing/)
  const revisionId = crypto.randomUUID()
  await call('enterprise_geo_draft', { id: revisionId, expectedRevision: 0, supersedesId: id, fields: { ...fields, name: 'Revised Studio' } })
  assert.equal((await call('enterprise_supplier_query', {})).records[0].id, id)
  await call('enterprise_geo_review', { id: revisionId, expectedRevision: 1, language: 'zh' })
  assert.equal((await call('enterprise_supplier_query', {})).records[0].id, revisionId)
  await harness.dispose()
  harness = await mount(directory, { maxKnowledgeResults: 1 })
  const stored = await (await harness.request('/supplier')).json()
  assert.deepEqual(stored.records.find(record => record.id === revisionId).supplier.presentation, fields.supplier.presentation)
  const first = (await call('enterprise_supplier_query', {})).records[0]
  assert.equal(first.hasMore, true)
  assert.equal(first.relations[0].to, 'launch')
  const related = (await call('enterprise_supplier_query', { recordId: revisionId, nodeId: first.relations[0].to })).records[0]
  assert.equal(related.items[0].kind, 'solution')
  const second = (await call('enterprise_supplier_query', { recordId: revisionId, offset: 1 })).records[0]
  assert.equal(second.items[0].id, 'launch')
  assert.equal(second.hasMore, false)
  await harness.request('/delete', { method: 'POST', body: JSON.stringify({ id: fileId }) })
  assert.equal((await call('enterprise_supplier_query', {})).records[0].evidence[0].availability, 'missing')
  await assert.rejects(call('enterprise_document_read', { fileId, chunk: 1 }), /missing/)
})

test('supplier drafts reject fabricated verification, dangling references and missing document chunks', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-supplier-invalid-'))
  const harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const { fields } = await supplierSetup(harness)
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'supplier-session' } } }
  const invalid = [
    graph => { graph.presentation = { focus: 'auto', headline: '', introduction: '', sections: [], featuredIds: ['missing'] } },
    graph => { graph.presentation = { focus: 'projects', headline: '', introduction: '', sections: ['case', 'case'], featuredIds: [] } },
    graph => { graph.nodes[0].claims[0].status = 'VERIFIED' },
    graph => { graph.nodes[0].claims[0].evidenceIds = ['missing'] },
    graph => { graph.nodes[0].claims[0].evidenceIds = [] },
    graph => { graph.relations[0].to = 'missing' },
    graph => { graph.nodes.push(structuredClone(graph.nodes[0])) },
    graph => { graph.evidence[0].source.chunk = 99 },
    graph => { graph.nodes[0].productRecordId = crypto.randomUUID() },
    graph => { graph.evidence[0].source = { type: 'web', uri: 'javascript:alert(1)', publishedAt: null } },
  ]
  for (const mutate of invalid) {
    const supplier = structuredClone(fields.supplier)
    mutate(supplier)
    await assert.rejects(harness.tools.get('enterprise_geo_draft').execute({ id: crypto.randomUUID(), expectedRevision: 0, fields: { ...fields, supplier } }, exec))
  }
  await assert.rejects(harness.tools.get('enterprise_geo_draft').execute({ id: crypto.randomUUID(), expectedRevision: 0, fields: { ...fields, kind: 'product' } }, exec), /invalid/)
})

test('external procurement API requires a key and explicit revision and document grants', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-supplier-api-'))
  let harness
  t.after(async () => { await harness?.dispose(); await rm(directory, { recursive: true, force: true }) })
  harness = await mount(directory)
  assert.equal(harness.routes.has('/supplier/v1/query'), false)
  const { fileId, fields } = await supplierSetup(harness)
  const secretFile = await harness.request('/upload', { method: 'POST', headers: { 'x-file-name': 'private.txt' }, body: 'viscose private customer pricing' })
  const privateId = (await secretFile.json()).files.find(item => item.id !== fileId).id
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'supplier-session' } } }
  const call = (name, args) => harness.tools.get(name).execute(args, exec)
  const id = crypto.randomUUID()
  await call('enterprise_geo_draft', { id, expectedRevision: 0, fields })
  await call('enterprise_geo_review', { id, expectedRevision: 1, language: 'zh' })
  const token = 'test-supplier-token-with-at-least-32-characters'
  await harness.dispose()
  harness = await mount(directory, { externalAgentToken: token, externalSupplierRecords: [{ id, revision: 2 }], externalDocumentIds: [] })
  const api = (path, key = token, method) => externalRequest(harness, `/supplier/v1/${path}`, key, method)
  assert.equal((await externalRequest(harness, '/supplier/v1/query')).status, 401)
  assert.equal((await api('query', 'wrong')).status, 401)
  assert.equal((await api('query', token, 'POST')).status, 405)
  assert.equal((await api('manifest')).data.readOnly, false)
  assert.equal((await api('query?offset=-1')).status, 400)
  assert.equal((await api('query?workspaceId=other')).status, 400)
  const redacted = await api('query')
  assert.equal(redacted.headers['cache-control'], 'no-store')
  assert.deepEqual(redacted.data.records[0].evidence, [{ id: 'catalog', availability: 'not_shared' }])
  assert.deepEqual((await api('search?query=viscose')).data.matches, [])
  assert.equal((await api(`document?fileId=${fileId}&chunk=1`)).status, 404)
  await harness.dispose()
  harness = await mount(directory, { externalAgentToken: token, externalSupplierRecords: [{ id, revision: 2 }], externalDocumentIds: [fileId] })
  const result = await api('search?query=viscose')
  assert.equal(result.data.matches.length, 1)
  assert.equal(result.data.matches[0].fileId, fileId)
  assert.equal((await api(`document?fileId=${privateId}&chunk=1`)).status, 404)
  const document = await api(`document?fileId=${fileId}&chunk=1`)
  assert.equal(document.data.content, result.data.matches[0].content)
  assert.equal((await api('query?kind=capability')).data.records[0].evidence[0].availability, 'available')
  const replacement = crypto.randomUUID()
  await call('enterprise_geo_draft', { id: replacement, expectedRevision: 0, supersedesId: id, fields })
  assert.equal((await api('query')).data.records.length, 1)
  await call('enterprise_geo_review', { id: replacement, expectedRevision: 1, language: 'zh' })
  assert.deepEqual((await api('query')).data.records, [])
  await harness.request('/delete', { method: 'POST', body: JSON.stringify({ id: fileId }) })
  assert.deepEqual((await api('search?query=viscose')).data.matches, [])
  assert.equal((await api(`document?fileId=${fileId}&chunk=1`)).status, 404)
  await harness.dispose()
  harness = await mount(directory, { externalAgentToken: `${token}-rotated`, externalSupplierRecords: [], externalDocumentIds: [] })
  assert.equal((await api('query')).status, 401)
})

test('external configuration rejects missing credentials and invalid grants', () => {
  const base = { directory: join(tmpdir(), 'unused-supplier-config'), ...limits }
  assert.equal(Config.safeParse(base).success, true)
  assert.equal(Config.safeParse({ ...base, externalAgentToken: 'short' }).success, false)
  assert.equal(Config.safeParse({ ...base, externalDocumentIds: [crypto.randomUUID()] }).success, false)
  assert.equal(Config.safeParse({ ...base, externalAgentToken: 'a'.repeat(32), externalSupplierRecords: [{ id: crypto.randomUUID(), revision: 0 }] }).success, false)
})

test('supplier workspace reviews sources, compares requirements and saves revision-bound requests', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'supplier-workflow-'))
  let harness = await mount(directory)
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const post = (path, data) => harness.request(`/supplier/${path}`, { method: 'POST', body: JSON.stringify(data) })
  const { fileId, fields } = await supplierSetup(harness)
  fields.supplier.nodes[0].claims = [{ ...fields.supplier.nodes[0].claims[0], qualification: '' }]
  const id = crypto.randomUUID()
  assert.equal((await post('draft', { id, expectedRevision: 0, fields })).status, 200)
  assert.equal((await post('confirm', { id, revision: 1 })).status, 200)
  assert.equal((await post('confirm', { id, revision: 1 })).status, 409)
  const matchInput = { recordId: id, requirements: [{ attribute: 'material', operator: 'equals', value: 'viscose' }] }
  assert.equal((await (await post('match', matchInput)).json()).candidates[0].status, 'POSSIBLE')
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'supplier-review' } } }
  harness.setAnswer({ answers: [{ id: 'supplier-verify', selected: ['修改'] }] })
  assert.equal((await harness.tools.get('enterprise_supplier_verify').execute({ id, expectedRevision: 2, language: 'zh' }, exec)).verified, false)
  harness.setAnswer({ answers: [{ id: 'supplier-verify', selected: ['确认'] }] })
  assert.equal((await harness.tools.get('enterprise_supplier_verify').execute({ id, expectedRevision: 2, language: 'zh' }, exec)).verified, true)
  assert.equal((await (await post('match', matchInput)).json()).candidates[0].status, 'MATCH')
  const request = { id: crypto.randomUUID(), recordId: id, recordRevision: 2, nodeIds: ['printing'], type: 'sample', name: 'Buyer', email: 'buyer@example.com', message: 'Please confirm 130 GSM and MOQ.' }
  const prepared = await harness.tools.get('enterprise_procurement_prepare').execute(request, exec)
  assert.equal(prepared.status, 'draft')
  assert.deepEqual(await harness.tools.get('enterprise_procurement_prepare').execute(request, exec), prepared)
  await assert.rejects(harness.tools.get('enterprise_procurement_prepare').execute({ ...request, message: 'Different' }, exec), /supplierConflict/)
  assert.equal((await post('request-status', { id: request.id, expectedRevision: 1, status: 'in_review' })).status, 409)
  assert.equal((await post('request-status', { id: request.id, expectedRevision: 1, status: 'submitted' })).status, 200)
  assert.equal((await post('request-status', { id: request.id, expectedRevision: 1, status: 'closed' })).status, 409)
  assert.equal((await post('request-status', { id: request.id, expectedRevision: 2, status: 'in_review' })).status, 200)
  assert.equal((await post('request-status', { id: request.id, expectedRevision: 3, status: 'closed' })).status, 200)
  await harness.dispose()
  harness = await mount(directory)
  const persisted = await (await harness.request('/supplier')).json()
  assert.equal(persisted.requests[0].status, 'closed')
  assert.equal(persisted.receipts[0].revision, 2)
  await harness.request('/delete', { method: 'POST', body: JSON.stringify({ id: fileId }) })
  assert.equal((await (await post('match', matchInput)).json()).candidates[0].status, 'POSSIBLE')
  assert.equal((await post('verify', { id, revision: 2 })).status, 404)
})

test('live sharing changes govern external matching and idempotent inbound inquiries', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'supplier-sharing-'))
  const token = 'supplier-api-test-token-000000000000000000'
  let harness = await mount(directory, { externalAgentToken: token })
  t.after(async () => { await harness.dispose(); await rm(directory, { recursive: true, force: true }) })
  const post = (path, data) => harness.request(`/supplier/${path}`, { method: 'POST', body: JSON.stringify(data) })
  const external = (path, data) => externalRequest(harness, `/supplier/v1/${path}`, token, data === undefined ? 'GET' : 'POST', data)
  const { fileId, fields } = await supplierSetup(harness)
  fields.supplier.nodes[0].claims = [{ ...fields.supplier.nodes[0].claims[0], qualification: '' }]
  const id = crypto.randomUUID()
  await post('draft', { id, expectedRevision: 0, fields })
  await post('confirm', { id, revision: 1 })
  await post('verify', { id, revision: 2 })
  const input = { recordId: id, requirements: [{ attribute: 'material', operator: 'equals', value: 'viscose' }] }
  assert.equal((await external('match', input)).status, 404)
  assert.equal((await post('access', { expectedRevision: 0, records: [{ id, revision: 2 }], documents: [] })).status, 200)
  assert.equal((await external('match', input)).data.candidates[0].status, 'POSSIBLE')
  assert.equal((await post('access', { expectedRevision: 0, records: [], documents: [] })).status, 409)
  assert.equal((await post('access', { expectedRevision: 1, records: [{ id, revision: 2 }], documents: [fileId] })).status, 200)
  assert.equal((await external('match', input)).data.candidates[0].status, 'MATCH')
  const inquiry = { id: crypto.randomUUID(), recordId: id, recordRevision: 2, nodeIds: ['printing'], type: 'quote', name: 'External buyer', email: 'buyer@example.com', message: 'Quote a sample.' }
  const result = await external('inquiries', inquiry)
  assert.deepEqual(result.data, { id: inquiry.id, status: 'submitted', revision: 1 })
  assert.deepEqual((await external('inquiries', inquiry)).data, result.data)
  assert.equal((await external('inquiries', { ...inquiry, message: 'Changed' })).status, 409)
  assert.equal((await external('inquiries', { ...inquiry, id: crypto.randomUUID(), recordRevision: 1 })).status, 404)
  assert.equal((await external('inquiries', { ...inquiry, id: crypto.randomUUID(), nodeIds: ['fabricated'] })).status, 400)
  assert.equal((await external('match', { ...input, verified: true })).status, 400)
  assert.equal((await post('access', { expectedRevision: 2, records: [], documents: [] })).status, 200)
  assert.equal((await external('match', input)).status, 404)
  assert.equal((await external(`document?fileId=${fileId}&chunk=1`)).status, 404)
  await harness.dispose()
  harness = await mount(directory, { externalAgentToken: token, externalSupplierRecords: [{ id, revision: 2 }], externalDocumentIds: [fileId] })
  assert.deepEqual((await external('query')).data.records, [])
  const state = await (await harness.request('/supplier')).json()
  assert.equal(state.access.revision, 3)
  assert.equal(state.requests.length, 1)
})
