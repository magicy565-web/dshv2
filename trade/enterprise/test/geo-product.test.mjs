import assert from 'node:assert/strict'
import test from 'node:test'
import { geoProduct, normalizeProduct, productReadiness } from '../src/geo-product.ts'
import { productPreview } from '../src/geo-preview.ts'
import { productFixture as productInput } from './geo-fixture.mjs'
import { geoFields, geoProposal } from '../src/geo-schema.ts'

const productFixture = () => geoProduct.parse(productInput())

const now = new Date('2026-09-15T00:00:00Z')
const record = product => ({ id: 'record', kind: 'product', name: 'R-821', status: 'confirmed', confirmedAt: '2026-09-14T00:00:00Z', productVerifiedAt: '2026-09-14T00:00:00Z', product })

test('readiness distinguishes human verification, unknown content and public discovery', () => {
  const product = geoProduct.parse(productFixture())
  assert.equal(productReadiness(undefined, false, now).layers.entity, 'PARTIAL')
  assert.equal(productReadiness(product, false, now).previewReady, false)
  const readiness = productReadiness(product, true, now)
  assert.equal(readiness.previewReady, true)
  assert.deepEqual(readiness.layers, { entity: 'READY', understanding: 'READY', facts: 'READY', evidence: 'READY', sitePublication: 'PARTIAL', discovery: 'PARTIAL', shopifySync: 'PARTIAL' })
  assert.equal(productPreview({ ...record(product), productVerifiedAt: undefined }, now), null)
  assert.equal(productPreview({ ...record(product), status: 'draft' }, now), null)
})

test('draft input excludes publication authority while persisted products retain it', () => {
  const proposal = { id: '00000000-0000-4000-8000-000000000001', expectedRevision: 0, fields: { kind: 'product', name: 'R-821', description: '', sections: [], questions: '', product: productInput() } }
  const parsed = geoFields.parse(geoProposal.parse(proposal).fields)
  assert.deepEqual(parsed.product.publication, { status: 'pending', siteStatus: 'pending', contentVersion: 0, shopifyVariants: [] })
  for (const publication of [{ siteStatus: 'published' }, { status: 'synced' }, { shopifyVariants: [{ id: 'fake', price: '1', currency: 'USD', updatedAt: now.toISOString() }] }]) {
    assert.equal(geoProposal.safeParse({ ...proposal, fields: { ...proposal.fields, product: { ...productInput(), publication } } }).success, false)
  }
  const product = geoProduct.parse({ ...productInput(), publication: { status: 'synced', siteStatus: 'published' } })
  assert.equal(productReadiness(product, true, now).layers.shopifySync, 'READY')
  assert.equal(productReadiness(product, true, now).layers.sitePublication, 'READY')
  product.publication.status = 'failed'
  assert.ok(productReadiness(product, true, now).issues.some(issue => issue.code === 'shopify_sync_failed'))
})

test('rejects verification forgery, unsafe URLs and ambiguous values at the input parser', () => {
  for (const change of [
    p => { p.claims[0].status = 'verified' },
    p => { p.identity.canonicalUrl = 'javascript:alert(1)' },
    p => { p.identity.manufacturer.url = 'https://user:password@example.com' },
    p => { p.claims[0].value.value = '120' },
    p => { p.identity.gtin = 'fake' },
    p => { p.evidence[0].recordedAt = 'yesterday' },
  ]) {
    const product = productFixture(); change(product)
    assert.equal(geoProduct.safeParse(product).success, false)
  }
})

test('invalid optional URLs report their field instead of throwing outside validation', () => {
  const product = productFixture()
  product.evidence[0].url = ''
  const result = geoProduct.safeParse(product)
  assert.equal(result.success, false)
  assert.deepEqual(result.error.issues[0].path, ['evidence', 0, 'url'])
  delete product.evidence[0].url
  assert.equal(geoProduct.safeParse(product).success, true)
})

test('refuses missing, future, expired, conflicting and inferred public evidence', () => {
  for (const [change, code] of [
    [p => { p.claims[0].evidenceIds = [] }, 'source_missing'],
    [p => { p.claims[0].evidenceIds = ['absent'] }, 'source_missing'],
    [p => { p.claims[0].status = 'inferred' }, 'claim_not_confirmable'],
    [p => { p.claims[0].status = 'conflicted' }, 'claim_not_confirmable'],
    [p => { p.claims[0].validUntil = now.toISOString() }, 'claim_expired'],
    [p => { p.evidence[0].recordedAt = '2027-01-01T00:00:00Z' }, 'future_timestamp'],
    [p => { p.claims.push({ ...p.claims[0] }) }, 'duplicate_id'],
    [p => { p.claims[0].value = { type: 'range', min: 140, max: 120, unit: 'g/m²' } }, 'invalid_range'],
    [p => { p.identity.gtin = '12345678' }, 'gtin_checksum'],
  ]) {
    const product = productFixture(); change(product)
    assert.ok(productReadiness(product, true, now).issues.some(issue => issue.code === code), code)
    assert.equal(productPreview(record(product), now), null)
  }
})

test('normalizes fabric measurements without manufacturing unknown commercial facts', () => {
  const product = productFixture()
  product.claims[0].value.unit = 'GSM'
  product.claims.push({ ...product.claims[0], id: 'width', property: 'fabric_width', value: { type: 'number', value: 1.45, unit: 'm' } })
  const normalized = normalizeProduct(product)
  assert.deepEqual(normalized.claims.map(claim => claim.value), [{ type: 'number', value: 120, unit: 'g/m²' }, { type: 'number', value: 145, unit: 'cm' }])
  assert.equal(product.claims[0].value.unit, 'GSM')
  assert.equal(normalized.offers.length, 0)
})

test('HTML and JSON-LD share reviewed values and never leak private evidence or executable markup', () => {
  const product = productFixture()
  product.understanding.directAnswer = '</script><script>alert(1)</script>'
  product.claims.push({ ...product.claims[0], id: 'secret', property: 'internal_cost', name: 'Private cost', public: false, value: { type: 'text', value: 'TOP_SECRET_COST' }, evidenceIds: ['private-source'] })
  product.evidence.push({ ...product.evidence[0], id: 'private-source', title: 'PRIVATE_SOURCE', public: false })
  const preview = productPreview(record(product), now)
  assert.ok(preview)
  assert.ok(!preview.html.includes('TOP_SECRET_COST'))
  assert.ok(!preview.html.includes('PRIVATE_SOURCE'))
  assert.ok(!preview.html.includes('<script>alert(1)</script>'))
  const embedded = JSON.parse(preview.html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])
  assert.deepEqual(embedded, JSON.parse(JSON.stringify(preview.jsonLd)))
  assert.equal(embedded.additionalProperty[0].value, '120 g/m²')
  assert.ok(preview.html.includes('120 g/m²'))
  assert.equal(embedded.offers, undefined)
  assert.ok(preview.html.includes('noindex,nofollow'))
})

test('commercial offers require referenced facts, an ordering unit and live validity', () => {
  const product = productFixture()
  product.claims.push({ ...product.claims[0], id: 'price', property: 'price', name: 'Price', category: 'commercial', value: { type: 'number', value: 2.1, unit: 'm' }, validUntil: '2026-10-01T00:00:00Z' })
  product.offers.push({ id: 'offer', seller: product.identity.manufacturer, claimIds: ['price'], currency: 'USD', unit: 'm', regions: ['US'], validUntil: '2026-10-01T00:00:00Z' })
  product.publication.shopifyVariants = [{ id: 'gid://shopify/ProductVariant/1', price: '2.1', currency: 'USD', availableForSale: true, updatedAt: now.toISOString() }]
  const preview = productPreview(record(product), now)
  assert.equal(preview.jsonLd.offers[0].price, '2.1')
  assert.ok(preview.html.includes('2.1 USD'))
  assert.equal(productPreview(record(product), new Date('2026-10-01T00:00:00Z')), null)
  product.offers[0].unit = 'kg'
  assert.ok(productReadiness(product, true, now).issues.some(issue => issue.code === 'price_invalid'))
  product.offers = []
  assert.ok(productReadiness(product, true, now).issues.some(issue => issue.code === 'offer_missing'))
})
