/** Existing Shopify ownership, private credentials and immutable launch destinations. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommerceDatabase } from '../src/database.ts'
import { fixture, key } from './fixture.ts'
import { EnterpriseLink } from '../src/enterprise-link.ts'
import { EnterpriseStore } from '../src/enterprise-store.ts'
import { ShopifyGateway } from '../src/shopify.ts'
import { AgentGateway } from '../src/runtime.ts'
import { handler } from '../src/http.ts'
import { shopifyStore } from '../../enterprise/src/shopify-store.ts'
import { storeConnection, encryptToken } from '../../enterprise/src/shopify-site.ts'
import { commerceShopify } from '../../enterprise/src/commerce-shopify.ts'
import type { Records } from '../src/schema.ts'

const secret = 'synthetic-enterprise-bridge-token-only'
function setup() {
  const f = fixture(), owner = new DatabaseSync(':memory:'), encryptionKey = Buffer.alloc(32, 7)
  owner.exec('CREATE TABLE shopify_connections(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE shopify_credentials(connection_id TEXT PRIMARY KEY,token TEXT)')
  const stores = shopifyStore(owner), calls: { domain: string; query: string }[] = []
  for (const name of ['first', 'second']) {
    const c = storeConnection({ id: name, shopDomain: `${name}.myshopify.com`, mode: 'oauth', status: 'connected', scopes: ['read_products', 'write_products', 'read_publications', 'write_publications'], createdAt: f.service.clock(), updatedAt: f.service.clock() })
    stores.saveConnection(c); stores.saveToken(c.id, encryptToken(`${name}-shopify-secret`, encryptionKey))
  }
  let published = false
  const transport: typeof fetch = async (url, init) => {
    const domain = new URL(String(url)).hostname, { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: { id?: string } }
    calls.push({ domain, query })
    assert.equal(new Headers(init?.headers).get('X-Shopify-Access-Token'), domain.split('.')[0] + '-shopify-secret')
    if (query.includes('publications(first:')) return Response.json({ data: { publications: { nodes: [{ id: 'gid://shopify/Publication/1', name: 'Online Store' }], pageInfo: { hasNextPage: false } } } })
    if (query.includes('shop{currencyCode}')) return Response.json({ data: { shop: { currencyCode: 'USD' } } })
    if (query.includes('productByIdentifier')) return Response.json({ data: { productByIdentifier: null } })
    if (query.includes('productSet(')) return Response.json({ data: { productSet: { product: { id: 'gid://shopify/Product/10', status: 'DRAFT' }, userErrors: [] } } })
    if (query.includes('product(id:')) return Response.json({ data: { product: { id: variables.id, status: published ? 'ACTIVE' : 'DRAFT', metafield: { value: f.db.list('launch')[0]?.id }, publishedOnPublication: published } } })
    if (query.includes('publishablePublish')) { published = true; return Response.json({ data: { publishablePublish: { userErrors: [] } } }) }
    if (query.includes('productUpdate')) return Response.json({ data: { productUpdate: { product: { id: 'gid://shopify/Product/10', status: 'ACTIVE' }, userErrors: [] } } })
    return Response.json({ data: { shop: { name: 'Synthetic Brand', currencyCode: 'USD' }, products: { nodes: [], pageInfo: { hasNextPage: false } } } })
  }
  const link = new EnterpriseLink(f.service, { token: secret, factoryId: f.factory.subjectId, merchantId: f.merchant.subjectId, returnUrl: 'http://127.0.0.1:3080/', ticketTtlMs: 60000, sessionTtlMs: 3600000 })
  const bridge = commerceShopify({ commerce: { token: secret, merchantId: f.merchant.subjectId, url: 'http://127.0.0.1:3100/', timeoutMs: 1000, maxBodyBytes: 100000 }, apiVersion: '2026-01', encryptionKey }, stores, transport)
  const client = new EnterpriseStore(f.service, link, { timeoutMs: 1000, maxResponseBytes: 100000 }, async (url, init) => bridge(new Request(url, init)))
  const gateway = new ShopifyGateway(f.service, (merchantId, launchId) => client.resolve(merchantId, launchId))
  return { ...f, stores, owner, calls, link, bridge, client, gateway, close() { f.db.close(); owner.close() }, select(name: string) { return client.select(f.merchant, { connectionId: name, publicationId: 'gid://shopify/Publication/1' }) } }
}

test('merchant continuation carries only its provisioned role and cannot disclose factory source receipts', t => {
  const f = setup(); t.after(() => f.close())
  const session = f.link.exchange(f.link.resume('merchant').code)
  assert.deepEqual(f.link.authenticate(session.token), f.merchant)
  assert.deepEqual(f.link.status(f.merchant)?.sources, [])
  assert.equal(f.link.authenticate(f.link.resume('factory').code), null)
  const factoryOnly = new EnterpriseLink(f.service, { ...f.link.config, merchantId: undefined })
  assert.throws(() => factoryOnly.resume('merchant'), /forbidden/)
  assert.equal(factoryOnly.authenticate(session.token), null)
})

test('upgrades preserve existing business records, assign session roles and add empty intake storage', t => {
  const dir = mkdtempSync(join(tmpdir(), 'commerce-store-migration-')), path = join(dir, 'store.sqlite')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const original = fixture(path); original.company(); const company = original.db.require('company', original.factory.subjectId)
  original.db.db.exec("DROP TABLE onboarding; DROP TABLE intakeSource; DROP TABLE commerce_store_bindings; DROP TABLE launch_store_bindings; ALTER TABLE linked_sessions DROP COLUMN role; INSERT INTO linked_sessions VALUES('fixture-hash','session','fixture-binding','2099-01-01T00:00:00.000Z'); PRAGMA user_version=5")
  original.db.close()
  const migrated = new CommerceDatabase(path)
  try {
    assert.deepEqual(migrated.require('company', company.id), company)
    assert.equal(migrated.db.prepare('SELECT role FROM linked_sessions').get()!.role, 'factory')
    assert.equal(migrated.db.prepare('PRAGMA user_version').get()!.user_version, 7)
    assert.deepEqual(migrated.list('onboarding'), [])
    assert.deepEqual(migrated.list('intakeSource'), [])
  } finally { migrated.close() }
})

test('existing encrypted credentials stay in their owner; revoked scopes, wrong merchant and browser origins cannot reach Shopify', async t => {
  const f = setup(); t.after(() => f.close())
  const metadata = await f.client.stores(f.merchant.subjectId)
  assert.equal(metadata.length, 2)
  assert.equal(JSON.stringify(metadata).includes('secret'), false)
  await assert.rejects(f.client.stores(key()), /shopify_not_connected/)
  const request = (body: unknown, headers = {}) => f.bridge(new Request('http://local/commerce/v1/shopify', { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))
  assert.equal((await request({ operation: 'stores', merchantId: key() })).status, 403)
  assert.equal((await request({ operation: 'stores', merchantId: f.merchant.subjectId }, { origin: 'http://127.0.0.1:3100' })).status, 403)
  assert.equal((await request({ operation: 'stores', merchantId: f.merchant.subjectId }, { authorization: 'Bearer invalid' })).status, 401)
  assert.equal((await request({ operation: 'graphql', merchantId: f.merchant.subjectId, query: 'mutation' })).status, 400)
  const c = f.stores.findConnection('first')!
  f.stores.saveConnection({ ...c, scopes: ['read_products'] })
  await assert.rejects(f.select('first'), /shopify_scope_missing/)
  await assert.rejects(f.client.publications(f.merchant.subjectId, 'first'), /shopify_scope_missing/)
  f.stores.saveConnection({ ...c, status: 'revoked' })
  await assert.rejects(f.select('first'), /shopify_not_connected/)
  assert.equal(f.calls.length, 0)
})

test('draft pins the existing store; changing the next store never redirects an approved launch', async t => {
  const f = setup(); t.after(() => f.close()); const launch = f.prepare()
  await f.select('first')
  await assert.rejects(f.client.select({ ...f.merchant, role: 'merchant-agent' }, { connectionId: 'second', publicationId: 'gid://shopify/Publication/1' }), /forbidden/)
  await assert.rejects(f.gateway.draft(f.factory, launch.id, launch.revision), /forbidden/)
  assert.equal(f.client.status(f.merchant)!.launches.length, 0)
  const draft = await f.gateway.draft(f.merchant, launch.id, launch.revision)
  await f.select('second')
  const requested = f.send(f.merchant, 'approval.request', { launchId: draft.id, expectedRevision: draft.revision }) as Records['approval']
  await assert.rejects(f.gateway.publish(f.merchant, requested.id), /approval_required/)
  const approval = f.send(f.merchant, 'approval.decide', { id: requested.id, expectedRevision: requested.revision, approve: true }) as Records['approval']
  await assert.rejects(f.gateway.publish({ ...f.merchant, role: 'merchant-agent' }, approval.id), /forbidden/)
  await f.gateway.publish(f.merchant, approval.id)
  const writes = f.calls.filter(c => c.query.startsWith('mutation'))
  assert.ok(writes.length >= 3)
  assert.ok(writes.every(c => c.domain === 'first.myshopify.com'))
  await f.gateway.publish(f.merchant, approval.id)
  assert.equal(f.calls.filter(c => c.query.startsWith('mutation')).length, writes.length)
  assert.equal(f.client.status(f.merchant)!.selected!.domain, 'second.myshopify.com')
  assert.equal(f.client.status(f.merchant)!.launches[0]!.domain, 'first.myshopify.com')
  assert.deepEqual({ nextStore: f.client.status(f.merchant)!.selected!.domain, launchStore: f.client.status(f.merchant)!.launches[0]!.domain, publication: f.client.status(f.merchant)!.launches[0]!.publicationName, launchStatus: f.db.require('launch', launch.id).status, approvalStatus: f.db.require('approval', approval.id).status, remoteWriteStores: [...new Set(writes.map(w => w.domain))] }, JSON.parse(readFileSync(new URL('./expected/store-link.json', import.meta.url), 'utf8')))
})

test('a reconfigured or revoked pinned connection stops publication before a remote write', async t => {
  const f = setup(); t.after(() => f.close()); const launch = f.prepare(); await f.select('first')
  const draft = await f.gateway.draft(f.merchant, launch.id, launch.revision)
  const requested = f.send(f.merchant, 'approval.request', { launchId: draft.id, expectedRevision: draft.revision }) as Records['approval']
  const approved = f.send(f.merchant, 'approval.decide', { id: requested.id, expectedRevision: requested.revision, approve: true }) as Records['approval']
  const c = f.stores.findConnection('first')!, before = f.calls.length
  f.stores.saveConnection({ ...c, shopDomain: 'changed.myshopify.com' })
  await assert.rejects(f.gateway.publish(f.merchant, approved.id), /shopify_store_changed/)
  f.stores.saveConnection({ ...c, status: 'revoked' })
  await assert.rejects(f.gateway.publish(f.merchant, approved.id, true), /shopify_not_connected/)
  assert.equal(f.calls.length, before)
})

test('merchant understanding reads the connected catalog as untrusted input and inference checks never mutate business data', async t => {
  const f = setup(); t.after(() => f.close()); await f.select('first')
  const prompts: string[] = []
  const agent = new AgentGateway(f.service, { async run({ prompt }) { prompts.push(prompt); return prompt.startsWith('Do not') ? '{"ok":true}' : '{"explanation":"Needs merchant confirmation","commands":[]}' } }, id => f.client.resolve(id).readCatalog())
  assert.deepEqual(await agent.check(), { status: 'connected' })
  assert.equal(f.db.list('activity').length, 0)
  await agent.run(f.merchant, { skill: 'merchant.understand', goal: 'Understand existing products', sources: [] })
  assert.ok(prompts[1]!.includes('Synthetic Brand'))
  assert.ok(!prompts[1]!.includes('shopify-secret'))
  assert.equal(f.db.list('merchantProfile').length, 0)
  await assert.rejects(agent.run(f.factory, { skill: 'merchant.understand', goal: 'Read a store', sources: [] }), /forbidden/)
  const http = handler({ service: f.service, credentials: [{ ...f.merchant, token: 'synthetic-merchant-human-token-only' }], maxBodyBytes: 100000, agent, shopify: f.gateway, enterprise: f.link, enterpriseStore: f.client })
  assert.equal((await http(new Request('http://local/api/agent/check', { method: 'POST', headers: { authorization: 'Bearer synthetic-merchant-human-token-only', 'content-type': 'application/json' }, body: '{}' }))).status, 200)
  const empty = new AgentGateway(f.service, { async run() { return '' } })
  await assert.rejects(empty.check(), /runtime_request_failed/)
})
