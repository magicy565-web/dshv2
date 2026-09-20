/** Provider-wire checks validate real GraphQL payloads without sending them to a store. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shopifyProvider, ShopifyGateway } from '../src/shopify.ts'
import { fixture } from './fixture.ts'
import type { Records } from '../src/schema.ts'

const config = { domain: 'fixture.myshopify.com', accessToken: 'fixture-only-token', apiVersion: '2026-07', publicationId: 'gid://shopify/Publication/1', timeoutMs: 1000, maxResponseBytes: 100000 }
test('Shopify draft sends DRAFT, variants, images, metadata and merchant price without publication', async t => {
  const f = fixture(); t.after(() => f.db.close()); const launch = f.prepare(), listing = f.db.list('listing')[0]!
  const calls: { query: string; variables: Record<string, unknown> }[] = []
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(String(url), 'https://fixture.myshopify.com/admin/api/2026-07/graphql.json')
    const body = JSON.parse(String(options?.body)) as typeof calls[number]; calls.push(body)
    if (body.query.includes('shop{currencyCode}')) return Response.json({ data: { shop: { currencyCode: 'USD' } } })
    if (body.query.includes('productByIdentifier')) return Response.json({ data: { productByIdentifier: null } })
    return Response.json({ data: { productSet: { product: { id: 'gid://shopify/Product/1', status: 'DRAFT' }, userErrors: [] } } })
  }
  assert.equal(await shopifyProvider(config, fetcher).draft(launch, listing), 'gid://shopify/Product/1')
  const payload = calls[2]!.variables.input as { status: string; variants: { price: string }[]; files: unknown[]; metafields: { value: string }[] }
  assert.equal(payload.status, 'DRAFT'); assert.equal(payload.variants[0]!.price, '50'); assert.equal(payload.files.length, 1); assert.equal(payload.metafields[0]!.value, launch.id)
  assert.equal(calls.some(c => c.query.includes('publishablePublish')), false)
})

test('store currency mismatch refuses a draft before a mutation', async t => {
  const f = fixture(); t.after(() => f.db.close()); const launch = f.prepare()
  let calls = 0
  await assert.rejects(shopifyProvider(config, async () => { calls++; return Response.json({ data: { shop: { currencyCode: 'EUR' } } }) }).draft(launch, f.db.list('listing')[0]!), /shopify_currency_mismatch/)
  assert.equal(calls, 1)
})

test('GraphQL userErrors and oversized responses never count as a successful draft', async t => {
  const f = fixture(); t.after(() => f.db.close()); const l = f.prepare()
  await assert.rejects(shopifyProvider({ ...config, maxResponseBytes: 5 }, async () => Response.json({ data: { shop: { currencyCode: 'USD' } } })).draft(l, f.db.list('listing')[0]!), /shopify_response_too_large/)
  await assert.rejects(shopifyProvider(config, async () => Response.json({ data: { productSet: { userErrors: [{ message: 'private provider diagnostic' }] } } })).readCatalog(), /shopify_mutation_rejected/)
})

test('concurrent draft submission acquires one durable operation checkpoint', async t => {
  const f = fixture(); t.after(() => f.db.close()); const launch = f.prepare()
  let finish!: (value: string) => void
  const remote = new Promise<string>(resolve => { finish = resolve })
  const gateway = new ShopifyGateway(f.service, () => ({ async readCatalog() { return {} }, async draft() { return remote }, async publish() {}, async isPublished() { return true } }))
  const first = gateway.draft(f.merchant, launch.id, launch.revision)
  await assert.rejects(gateway.draft(f.merchant, launch.id, launch.revision), /draft_unavailable/)
  finish('gid://shopify/Product/1'); await first
  assert.equal(f.db.require('launch', launch.id).status, 'READY')
})

test('sources cannot change while approved publication is in flight', async t => {
  const f = fixture(); t.after(() => f.db.close()); let l = f.prepare()
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  const gateway = new ShopifyGateway(f.service, () => ({ async readCatalog() { return {} }, async draft() { return 'gid://shopify/Product/1' }, async publish() { await pending }, async isPublished() { return true } }))
  l = await gateway.draft(f.merchant, l.id, l.revision)
  const approval = f.send(f.merchant, 'approval.request', { launchId: l.id, expectedRevision: l.revision }) as Records['approval']
  f.send(f.merchant, 'approval.decide', { id: approval.id, expectedRevision: approval.revision, approve: true })
  const operation = gateway.publish(f.merchant, approval.id)
  const p = f.db.require('passport', l.productId)
  assert.throws(() => f.send(f.factory, 'product.save', { id: p.id, expectedRevision: p.revision, facts: {} }), /publication_requires_reconciliation/)
  finish(); await operation
})
