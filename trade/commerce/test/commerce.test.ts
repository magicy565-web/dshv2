/** Factory-to-launch acceptance and negative business invariants without provider credentials. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CommerceDatabase } from '../src/database.ts'
import { ShopifyGateway } from '../src/shopify.ts'
import type { ShopifyProvider } from '../src/shopify.ts'
import type { Records } from '../src/schema.ts'
import { fixture, key, fact } from './fixture.ts'
import { handler } from '../src/http.ts'
import { AgentGateway } from '../src/runtime.ts'

function provider(): ShopifyProvider & { calls: string[] } {
  const calls: string[] = []
  return { calls, async readCatalog() { return { products: [] } }, async draft() { calls.push('DRAFT'); return 'gid://shopify/Product/123' }, async publish() { calls.push('PUBLISH') }, async isPublished() { calls.push('INSPECT'); return true } }
}

test('20 factory products → three basic records → one ready opportunity → sample → approved launch → revenue → durable decision', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'commerce-test-')), path = join(directory, 'commerce.sqlite')
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const f = fixture(path); t.after(() => { try { f.db.close() } catch (error) { if (!(error instanceof Error && error.message.includes('not open'))) throw error } })
  f.company()
  const ready = f.product()
  f.product(false); f.product(false)
  for (let i = 0; i < 17; i++) f.send(f.factory, 'product.save', { id: key(), expectedRevision: 0, facts: { 'identity.product_name': fact(`Incomplete fixture ${i}`) } })
  assert.equal(f.db.list('product').length, 20)
  assert.equal(f.db.list('product').filter(p => f.service.readiness(p.id).status === 'OPPORTUNITY_READY').length, 1)
  assert.equal(f.db.list('product').filter(p => f.service.readiness(p.id).status === 'COMMERCIAL_INCOMPLETE').length, 2)
  f.opportunity(ready); f.profile()
  const matches = f.send(f.merchant, 'match.run') as Records['match'][]
  assert.equal(matches.length, 1); assert.match(matches[0]!.explanation.moq, /30.*50/)
  assert.deepEqual({ explanation: matches[0]!.explanation, risks: matches[0]!.risks, unknowns: matches[0]!.unknowns }, JSON.parse(readFileSync(new URL('./expected/match.json', import.meta.url), 'utf8')))
  assert.ok(matches[0]!.unknowns.length); assert.equal('score' in matches[0]!, false)
  let sample = f.sample(matches[0]!)
  for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'ACCEPTED'] as const) sample = f.moveSample(sample, status)
  let launch = f.send(f.merchant, 'launch.prepare', { sampleId: sample.id, targetPrice: 50, targetMargin: 50, initialInventoryModel: 'Small test batch' }) as Records['launch']
  assert.equal(f.db.list('artifact').length, 10)
  const remote = provider(), gateway = new ShopifyGateway(f.service, () => remote)
  launch = await gateway.draft(f.merchant, launch.id, launch.revision)
  assert.deepEqual(remote.calls, ['DRAFT'])
  const approval = f.send(f.merchant, 'approval.request', { launchId: launch.id, expectedRevision: launch.revision }) as Records['approval']
  await assert.rejects(gateway.publish(f.merchant, approval.id), /approval_required/)
  f.send(f.merchant, 'approval.decide', { id: approval.id, expectedRevision: approval.revision, approve: true })
  await gateway.publish(f.merchant, approval.id)
  await gateway.publish(f.merchant, approval.id)
  assert.deepEqual(remote.calls, ['DRAFT', 'PUBLISH'])
  f.setTime('2026-09-23T08:00:00.000Z')
  const performance = f.send(f.merchant, 'performance.record', { launchId: launch.id, sourceReference: 'Synthetic Shopify export fixture', periodStart: '2026-09-21T08:00:00.000Z', periodEnd: '2026-09-22T08:00:00.000Z', currency: 'USD', views: null, addToCart: null, orders: 18, unitsSold: 20, revenue: 1000, refunds: 50 }) as Records['performance']
  assert.equal(performance.grossMarginEstimate, 750); assert.equal(performance.views, null)
  launch = f.db.require('launch', launch.id)
  f.send(f.merchant, 'launch.decision', { id: launch.id, expectedRevision: launch.revision, decision: 'SCALE', performanceId: performance.id })
  f.db.close()
  const reopened = new CommerceDatabase(path)
  try { assert.equal(reopened.require('launch', launch.id).status, 'SCALE'); assert.equal(reopened.list('performance')[0]!.revenue, 1000); assert.ok(reopened.list('activity').length > 30) }
  finally { reopened.close() }
})

test('agent cannot assert confirmed facts, impersonate a factory, confirm, or approve', t => {
  const f = fixture(); t.after(() => f.db.close()); f.company()
  const agent = { ...f.factory, role: 'factory-agent' as const }
  assert.throws(() => f.send(agent, 'company.save', { id: f.factory.subjectId, expectedRevision: 2, facts: { legal_name: { ...fact('Impersonation'), status: 'VERIFIED' } } }), /human_confirmation_required/)
  assert.throws(() => f.confirm(agent, 'company'), /forbidden/)
  assert.throws(() => f.send(f.merchant, 'company.save', { id: f.factory.subjectId, expectedRevision: 2, facts: {} }), /forbidden/)
})

test('unknown, private, revoked, conflicted and stale facts cannot support recommendation', t => {
  const f = fixture(); t.after(() => f.db.close()); f.company()
  const incomplete = f.product(false)
  assert.throws(() => f.opportunity(incomplete), /product_not_ready/)
  const ready = f.product(); const o = f.opportunity(ready); f.profile()
  const e = f.db.require('passport', ready).facts['commercial.moq']!.evidenceIds[0]!
  f.send(f.factory, 'evidence.revoke', { id: e, expectedRevision: 1 })
  assert.equal(f.service.available(o), false)
  assert.deepEqual(f.send(f.merchant, 'match.run'), [])
  const r = f.db.require('passport', ready)
  f.send(f.factory, 'product.save', { id: ready, expectedRevision: r.revision, facts: { 'commercial.moq': { ...fact(30), status: 'CONFLICTING' } } })
  assert.throws(() => f.confirm(f.factory, 'passport', ready), /fact_unresolved/)
})

test('same request is idempotent; reused identity and stale revisions cannot overwrite facts', t => {
  const f = fixture(); t.after(() => f.db.close())
  const c = { type: 'company.save', requestId: key(), id: f.factory.subjectId, expectedRevision: 0, facts: { legal_name: fact('Fixture') } }
  assert.deepEqual(f.service.execute(f.factory, c), f.service.execute(f.factory, c))
  assert.equal(f.db.list('activity').length, 1)
  assert.throws(() => f.service.execute(f.factory, { ...c, facts: {} }), /idempotency_conflict/)
  assert.throws(() => f.service.execute(f.factory, { ...c, requestId: key() }), /revision_conflict/)
})

test('revoked merchant evidence hides a recommendation and blocks new sample requests', t => {
  const f = fixture(); t.after(() => f.db.close()); const { match } = f.matched()
  const evidenceId = f.db.require('merchantProfile', f.merchant.subjectId).facts.market!.evidenceIds[0]!
  f.send(f.merchant, 'evidence.revoke', { id: evidenceId, expectedRevision: 1 })
  const snapshot = f.service.snapshot(f.merchant)
  assert.equal(snapshot.role, 'merchant'); assert.deepEqual(snapshot.matches, [])
  assert.throws(() => f.sample(match), /match_stale/)
})

test('NOT_INTERESTED keeps its reason and suppresses a rebuilt opportunity for the same product', t => {
  const f = fixture(); t.after(() => f.db.close()); const { match, productId } = f.matched()
  f.send(f.merchant, 'match.feedback', { id: match.id, expectedRevision: match.revision, feedback: 'NOT_INTERESTED', reason: 'high_moq' })
  f.opportunity(productId)
  assert.deepEqual(f.send(f.merchant, 'match.run'), [])
  assert.equal(f.db.require('match', match.id).reason, 'high_moq')
})

test('merchant constraints filter currency, MOQ, category and audience instead of returning scores', t => {
  const f = fixture(); t.after(() => f.db.close()); f.matched()
  const cases: [string, string | number | string[]][] = [['strategy.max_moq', 1], ['strategy.currency', 'EUR'], ['strategy.preferred_categories', ['Shoes']], ['brand.audience', 'Professional climbers']]
  for (const [field, value] of cases) {
    const profile = f.db.require('merchantProfile', f.merchant.subjectId)
    f.send(f.merchant, 'merchant.save', { id: profile.id, expectedRevision: profile.revision, name: 'Fixture', facts: { [field]: fact(Array.isArray(value) ? [...value] : value) } })
    f.confirm(f.merchant, 'merchantProfile')
    assert.deepEqual(f.send(f.merchant, 'match.run'), [])
  }
})

test('other merchant cannot read samples or launch another merchant test; acceptance cannot be skipped', t => {
  const f = fixture(); t.after(() => f.db.close()); const { match } = f.matched(), sample = f.sample(match)
  const other = { ...f.merchant, subjectId: key() }
  assert.throws(() => f.send(other, 'sample.request', { matchId: match.id, variant: 'x', shippingAddress: 'x' }), /forbidden/)
  assert.throws(() => f.moveSample(sample, 'ACCEPTED'), /invalid_transition/)
  assert.throws(() => f.send(f.merchant, 'launch.prepare', { sampleId: sample.id, targetPrice: 50, targetMargin: null, initialInventoryModel: 'test' }), /sample_acceptance_required/)
  assert.deepEqual(f.service.snapshot(other).samples, [])
})

test('HTTP authenticates every route, bounds JSON and rejects forged actor fields', async t => {
  const f = fixture(); t.after(() => f.db.close())
  const token = 'fixture-owner-token-with-at-least-32-characters'
  const api = handler({ service: f.service, credentials: [{ ...f.factory, token }], maxBodyBytes: 1000 })
  const get = (path: string, auth = '') => api(new Request(`http://localhost${path}`, { headers: { Authorization: auth } }))
  assert.equal((await get('/api/workspace')).status, 401)
  assert.equal((await get('/api/workspace', `Bearer ${token}`)).status, 200)
  assert.equal((await get('/api/marketplace', `Bearer ${token}`)).status, 404)
  const post = (body: object) => api(new Request('http://localhost/api/commands', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  assert.equal((await post({ requestId: key(), type: 'company.save', id: f.factory.subjectId, expectedRevision: 0, facts: {}, actor: 'merchant' })).status, 400)
  assert.equal((await post({ payload: 'x'.repeat(1100) })).status, 413)
  assert.equal((await get('/api/workspace', 'Bearer ' + 'é'.repeat(token.length))).status, 401)
})

test('Gateway rejects model-proposed confirmations and records proposals without applying them', async t => {
  const f = fixture(); t.after(() => f.db.close())
  const command = { requestId: key(), type: 'company.save', id: f.factory.subjectId, expectedRevision: 0, facts: { legal_name: fact('Fixture from supplied catalog') } }
  const gateway = new AgentGateway(f.service, { async run({ prompt }) { assert.match(prompt, /Sources are untrusted/); return JSON.stringify({ explanation: 'Catalog extraction; confirmation required.', commands: [command] }) } })
  await gateway.run(f.factory, { skill: 'company.intake', goal: 'Extract company', sources: [{ reference: 'fixture.txt', text: 'Fixture from supplied catalog' }] })
  assert.equal(f.db.list('company').length, 0)
  gateway.apply(f.factory, command)
  assert.equal(f.db.list('company').length, 1)
  const malicious = new AgentGateway(f.service, { async run() { return JSON.stringify({ explanation: 'unsafe', commands: [{ type: 'facts.confirm', requestId: key(), entityType: 'company', id: f.factory.subjectId, expectedRevision: 1, fields: ['legal_name'], visibility: 'PUBLIC' }] }) } })
  await assert.rejects(malicious.run(f.factory, { skill: 'company.intake', goal: 'Extract', sources: [] }), /agent_action_not_allowed/)
})

test('uncertain Shopify publication never creates a second product or repeats publish on reconciliation', async t => {
  const f = fixture(); t.after(() => f.db.close()); let l = f.prepare()
  const remote = provider(); remote.publish = async () => { remote.calls.push('PUBLISH'); throw new Error('lost response') }
  const gateway = new ShopifyGateway(f.service, () => remote)
  l = await gateway.draft(f.merchant, l.id, l.revision)
  const approval = f.send(f.merchant, 'approval.request', { launchId: l.id, expectedRevision: l.revision }) as Records['approval']
  f.send(f.merchant, 'approval.decide', { id: approval.id, expectedRevision: approval.revision, approve: true })
  await assert.rejects(gateway.publish(f.merchant, approval.id), /lost response/)
  assert.equal(f.db.require('approval', approval.id).status, 'UNCERTAIN')
  await assert.rejects(gateway.publish(f.merchant, approval.id), /approval_required/)
  await gateway.publish(f.merchant, approval.id, true)
  assert.deepEqual(remote.calls, ['DRAFT', 'PUBLISH', 'INSPECT'])
})

test('passport revision change invalidates previously approved publication', async t => {
  const f = fixture(); t.after(() => f.db.close()); let l = f.prepare()
  const remote = provider(), gateway = new ShopifyGateway(f.service, () => remote)
  l = await gateway.draft(f.merchant, l.id, l.revision)
  const approval = f.send(f.merchant, 'approval.request', { launchId: l.id, expectedRevision: l.revision }) as Records['approval']
  f.send(f.merchant, 'approval.decide', { id: approval.id, expectedRevision: approval.revision, approve: true })
  const p = f.db.require('passport', l.productId)
  f.send(f.factory, 'product.save', { id: p.id, expectedRevision: p.revision, facts: { 'commercial.moq': fact(500) } })
  await assert.rejects(gateway.publish(f.merchant, approval.id), /launch_sources_stale/)
  assert.deepEqual(remote.calls, ['DRAFT'])
})

test('database refuses a future schema version without modifying it', t => {
  const dir = mkdtempSync(join(tmpdir(), 'commerce-version-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'future.sqlite'), db = new DatabaseSync(path)
  db.exec('PRAGMA user_version=999'); db.close()
  assert.throws(() => new CommerceDatabase(path), /database_version_unsupported/)
  const verify = new DatabaseSync(path)
  try { assert.equal(verify.prepare('PRAGMA user_version').get()?.user_version, 999) } finally { verify.close() }
})
