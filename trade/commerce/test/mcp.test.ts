/** Scripted MCP clients exercise persisted intake without a model or shared network listener. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import { mcpHandler } from '../src/mcp.ts'
import { intakeStatus } from '../src/intake.ts'
import { CommerceService } from '../src/service.ts'
import { CommerceDatabase } from '../src/database.ts'
import type { Principal } from '../src/schema.ts'
import { fixture, key } from './fixture.ts'

const token = 'synthetic-supplier-agent-credential-0001'
const config = { allowedHosts: ['mcp.example.test'], allowedOrigins: [] }
const endpoint = 'https://mcp.example.test/mcp'
const result = z.object({ data: z.unknown() })

function gateway(service: CommerceService, actor: Principal, authToken = token) {
  return mcpHandler({ service, config, maxBodyBytes: 16000, credentials: [{ ...actor, token: authToken }] })
}

async function connect(handle: ReturnType<typeof mcpHandler>, authToken = token) {
  const client = new Client({ name: 'scripted-workbuddy-client', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${authToken}` } },
    fetch: (url, init) => handle(new Request(url, init)),
  })
  // The SDK transport declares an optional sessionId differently under exactOptionalPropertyTypes.
  try { await client.connect(transport as Transport) }
  catch (error) { await client.close(); throw error }
  return client
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const response = await client.callTool({ name, arguments: args })
  assert.notEqual(response.isError, true, JSON.stringify(response.content))
  return result.parse(response.structuredContent).data
}

async function refused(client: Client, name: string, args: Record<string, unknown>, code: string) {
  const response = await client.callTool({ name, arguments: args })
  assert.equal(response.isError, true)
  assert.match(JSON.stringify(response.content), new RegExp(code))
}

function document() {
  const id = key()
  return { id, source: { kind: 'DOCUMENT', name: 'supplier-catalog.txt', reference: 'supplier-catalog.txt, page 1', text: 'Example Factory manufactures the Blue Cup and Green Cup. Minimum order: 100 units.' } }
}

test('MCP discovery, sourced private drafts, retries and exact submission survive client and database restarts', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'trade-mcp-'))
  const databases: CommerceDatabase[] = [], clients: Client[] = []
  t.after(async () => {
    for (const client of clients) await client.close()
    for (const database of databases) if (database.db.isOpen) database.close()
    rmSync(directory, { recursive: true, force: true })
  })
  const path = join(directory, 'commerce.sqlite'), f = fixture(path)
  databases.push(f.db)
  const actor: Principal = { ...f.factory, role: 'factory-agent' }
  const client = await connect(gateway(f.service, actor)); clients.push(client)
  const catalog = await client.listTools()
  const discovery = catalog.tools.map(tool => ({ name: tool.name, description: tool.description, annotations: tool.annotations }))
  assert.deepEqual(discovery, JSON.parse(readFileSync(new URL('./expected/mcp-tools.json', import.meta.url), 'utf8')))
  assert.deepEqual(catalog.tools.find(tool => tool.name === 'trade_get_context')!.inputSchema, { type: 'object', properties: {}, additionalProperties: false, $schema: 'http://json-schema.org/draft-07/schema#' })
  await call(client, 'trade_start_onboarding', { requestId: key() })
  const source = document()
  const sourceCommand = { requestId: key(), ...source }
  assert.deepEqual(await call(client, 'trade_add_source', sourceCommand), await call(client, 'trade_add_source', sourceCommand))
  const sourced = (value: string | number, excerpt: string) => ({ value, sources: [{ id: source.id, excerpt }] })
  const company = { requestId: key(), expectedRevision: 0, facts: { legal_name: sourced('Example Factory', 'Example Factory') } }
  assert.deepEqual(await call(client, 'trade_save_company', company), await call(client, 'trade_save_company', company))
  const products = ['Blue Cup', 'Green Cup'].map(name => ({ id: key(), expectedRevision: 0, facts: { 'identity.product_name': sourced(name, name), 'commercial.moq': sourced(100, 'Minimum order: 100 units.'), 'commercial.cost': { value: null, sources: [] } } }))
  const productCommand = { requestId: key(), products }
  assert.deepEqual(await call(client, 'trade_save_products', productCommand), await call(client, 'trade_save_products', productCommand))
  assert.equal(f.db.list('product').length, 2)
  assert.equal(f.db.list('evidence').length, 5)
  assert.ok(f.db.list('evidence').every(e => e.intakeSourceId === source.id && e.sourceUser === null && e.verificationStatus === 'AI_INFERRED'))
  let status = intakeStatus(f.db, actor, f.service.clock())
  assert.equal(status.missingFields.company.includes('legal_name'), false)
  assert.equal(status.missingFields.products[0]!.fields.includes('commercial.moq'), false)
  const submit = { requestId: key(), expectedRevision: status.onboarding!.revision, companyRevision: status.company!.revision, products: status.products.map(p => ({ id: p.id, revision: p.revision })) }
  assert.deepEqual(await call(client, 'trade_submit_onboarding', submit), await call(client, 'trade_submit_onboarding', submit))
  const missing = z.object({ status: z.string() }).parse(await call(client, 'trade_get_missing_fields'))
  assert.equal(missing.status, 'SUBMITTED')
  await client.close()
  f.db.close()
  const reopened = new CommerceDatabase(path); databases.push(reopened)
  const restored = new CommerceService(reopened, () => '2026-09-21T08:00:00.000Z')
  const resumed = await connect(gateway(restored, actor)); clients.push(resumed)
  assert.equal(z.object({ status: z.string() }).parse(await call(resumed, 'trade_get_context')).status, 'SUBMITTED')
  assert.equal(z.object({ source: z.object({ text: z.string() }) }).parse(await call(resumed, 'trade_get_source', { id: source.id })).source.text, source.source.text)
  status = intakeStatus(reopened, actor, restored.clock())
  assert.deepEqual(status.products.map(p => ({ name: p.facts['identity.product_name']!.value, status: p.facts['identity.product_name']!.status, visibility: p.facts['identity.product_name']!.visibility })), [
    { name: 'Blue Cup', status: 'AI_INFERRED', visibility: 'CONFIDENTIAL' },
    { name: 'Green Cup', status: 'AI_INFERRED', visibility: 'CONFIDENTIAL' },
  ])
  await call(resumed, 'trade_save_products', { requestId: key(), products: [{ id: status.products[0]!.id, expectedRevision: status.products[0]!.revision, facts: { 'commercial.cost': { value: 3, sources: [] } } }] })
  assert.equal(intakeStatus(reopened, actor, restored.clock()).status, 'DRAFT')
  await refused(resumed, 'trade_submit_onboarding', { ...submit, requestId: key() }, 'revision_conflict')
})

test('MCP refuses identity substitution, foreign data, fabricated excerpts, stale batches and confirmation tools', async t => {
  const f = fixture(); t.after(() => f.db.close())
  const actor: Principal = { ...f.factory, role: 'factory-agent' }, other: Principal = { role: 'factory-agent', subjectId: key() }
  const client = await connect(gateway(f.service, actor)); t.after(() => client.close())
  const stranger = await connect(gateway(f.service, other, 'synthetic-other-agent-credential-0002'), 'synthetic-other-agent-credential-0002'); t.after(() => stranger.close())
  await call(client, 'trade_start_onboarding', { requestId: key() })
  await call(stranger, 'trade_start_onboarding', { requestId: key() })
  const source = document(); await call(client, 'trade_add_source', { requestId: key(), ...source })
  await refused(stranger, 'trade_get_source', { id: source.id }, 'source_not_found')
  await refused(stranger, 'trade_add_source', { requestId: key(), ...source }, 'source_not_found')
  const company = { requestId: key(), expectedRevision: 0, facts: { legal_name: { value: 'Example Factory', sources: [{ id: source.id, excerpt: 'Example Factory' }] } } }
  await refused(stranger, 'trade_save_company', company, 'source_not_found')
  await refused(client, 'trade_save_company', { ...company, companyId: other.subjectId }, 'Unrecognized|unrecognized')
  await refused(client, 'trade_save_company', { ...company, facts: { legal_name: { value: 'Fake', sources: [{ id: source.id, excerpt: 'Absent from source' }] } } }, 'source_excerpt_mismatch')
  await refused(client, 'trade_save_company', { ...company, facts: { legal_name: { ...company.facts.legal_name, status: 'VERIFIED' } } }, 'Unrecognized|unrecognized')
  assert.equal(f.db.get('company', actor.subjectId), null)
  await call(client, 'trade_save_company', company)
  await refused(client, 'trade_save_company', { ...company, facts: { legal_name: { value: 'Changed', sources: [] } } }, 'idempotency_conflict')
  const freshId = key(), before = f.db.list('activity').length
  await refused(client, 'trade_save_products', { requestId: key(), products: [
    { id: freshId, expectedRevision: 0, facts: { 'identity.product_name': { value: 'Blue Cup', sources: [] } } },
    { id: key(), expectedRevision: 12, facts: { 'identity.product_name': { value: 'Green Cup', sources: [] } } },
  ] }, 'revision_conflict')
  assert.equal(f.db.get('product', freshId), null)
  assert.equal(f.db.list('activity').length, before)
  await call(client, 'trade_save_products', { requestId: key(), products: [{ id: freshId, expectedRevision: 0, facts: { 'identity.product_name': { value: 'Blue Cup', sources: [] } } }] })
  await call(stranger, 'trade_save_company', { requestId: key(), expectedRevision: 0, facts: { legal_name: { value: 'Other', sources: [] } } })
  await refused(stranger, 'trade_save_products', { requestId: key(), products: [{ id: freshId, expectedRevision: 1, facts: { 'identity.product_name': { value: 'Hijacked', sources: [] } } }] }, 'forbidden')
  await refused(client, 'facts.confirm', {}, 'not found')
  const status = intakeStatus(f.db, actor, f.service.clock())
  await refused(client, 'trade_submit_onboarding', { requestId: key(), expectedRevision: status.onboarding!.revision, companyRevision: status.company!.revision, products: [{ id: freshId, revision: 1 }] }, 'product_name_source_required')
  const otherContext = z.object({ products: z.array(z.unknown()), sources: z.array(z.unknown()) }).parse(await call(stranger, 'trade_get_context'))
  assert.deepEqual(otherContext.products, []); assert.deepEqual(otherContext.sources, [])
})

test('MCP authenticates every request, rejects untrusted hosts/origins and bounds body reads', async t => {
  const f = fixture(); t.after(() => f.db.close())
  const actor: Principal = { ...f.factory, role: 'factory-agent' }, handle = gateway(f.service, actor)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
  const message = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  const request = (overrides: RequestInit = {}) => new Request(endpoint, { method: 'POST', headers, body: message, ...overrides })
  assert.equal((await handle(request({ headers: { ...headers, Authorization: 'Bearer wrong' } }))).status, 401)
  assert.equal((await handle(request({ headers: { ...headers, Origin: 'https://attacker.test' } }))).status, 403)
  assert.equal((await handle(request({ headers: { ...headers, Host: 'attacker.test' } }))).status, 403)
  assert.equal((await gateway(f.service, f.factory)(request())).status, 403)
  assert.equal((await handle(request({ method: 'GET', body: null }))).status, 405)
  assert.equal((await handle(request({ method: 'DELETE', body: null }))).status, 405)
  assert.equal((await handle(request({ body: '{bad' }))).status, 400)
  assert.equal((await handle(request({ body: JSON.stringify({ text: 'x'.repeat(17000) }), headers: { ...headers, 'Content-Length': '1' } }))).status, 413)
  assert.equal((await handle(request({ headers: { ...headers, 'Content-Type': 'text/plain' } }))).status, 415)
  const controller = new AbortController(); controller.abort()
  assert.equal((await handle(request({ signal: controller.signal }))).status, 400)
  assert.equal((await handle(request())).status, 200)
  assert.deepEqual(f.db.list('company'), [])
})

test('source revocation invalidates submitted intake and immutable sources cannot be replaced', async t => {
  const f = fixture(); t.after(() => f.db.close())
  const actor: Principal = { ...f.factory, role: 'factory-agent' }
  const client = await connect(gateway(f.service, actor)); t.after(() => client.close())
  await call(client, 'trade_start_onboarding', { requestId: key() })
  const source = document()
  await call(client, 'trade_add_source', { requestId: key(), ...source })
  await refused(client, 'trade_add_source', { requestId: key(), ...source, source: { ...source.source, text: 'Replacement' } }, 'source_immutable')
  await call(client, 'trade_save_company', { requestId: key(), expectedRevision: 0, facts: { legal_name: { value: 'Example Factory', sources: [{ id: source.id, excerpt: 'Example Factory' }] } } })
  const status = intakeStatus(f.db, actor, f.service.clock())
  const scope = { requestId: key(), expectedRevision: status.onboarding!.revision, companyRevision: status.company!.revision, products: [] }
  await call(client, 'trade_submit_onboarding', scope)
  assert.equal(intakeStatus(f.db, actor, f.service.clock()).status, 'SUBMITTED')
  const evidence = f.db.list('evidence')[0]!
  f.send(f.factory, 'evidence.revoke', { id: evidence.id, expectedRevision: evidence.revision })
  assert.equal(intakeStatus(f.db, actor, f.service.clock()).status, 'DRAFT')
  await refused(client, 'trade_submit_onboarding', { ...scope, requestId: key(), expectedRevision: intakeStatus(f.db, actor, f.service.clock()).onboarding!.revision }, 'company_name_source_required')
})
