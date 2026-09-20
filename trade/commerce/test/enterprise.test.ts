/** Enterprise continuation exercises real source adaptation, authorization and durable version invalidation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fixture, fact, key } from './fixture.ts'
import { EnterpriseLink } from '../src/enterprise-link.ts'
import { handler } from '../src/http.ts'
import { exportCommerce } from '../../enterprise/src/commerce-export.ts'
import { openCommerce } from '../../enterprise/src/commerce-link.ts'
import { profileSchema } from '../../enterprise/src/schema.ts'
import { geoRecord } from '../../enterprise/src/geo-schema.ts'
import type { EnterpriseTransfer } from '../src/enterprise-wire.ts'

const token = 'integration-secret-not-a-real-credential'
function catalog(): EnterpriseTransfer {
  const source = fixture()
  try {
    source.company(); const product = source.product()
    const fields = (facts: Record<string, ReturnType<typeof fact>>) => Object.fromEntries(Object.entries(facts).map(([field, f]) => [field, { value: f.value, sourceStatus: 'declared', citation: 'Synthetic source catalog page 4', validUntil: null, conflicting: false }]))
    return { version: 1, company: { sourceId: 'fixture-company', revision: 1, confirmedAt: '2026-09-20T00:00:00.000Z', facts: fields(source.db.require('company', source.factory.subjectId).facts) }, products: [{ sourceId: 'fixture-product', revision: 1, confirmedAt: '2026-09-20T00:00:00.000Z', facts: fields(source.db.require('passport', product).facts) }] }
  } finally { source.db.close() }
}
function link(f: ReturnType<typeof fixture>) { return new EnterpriseLink(f.service, { token, factoryId: f.factory.subjectId, returnUrl: 'http://127.0.0.1:3080/', ticketTtlMs: 60000, sessionTtlMs: 3600000 }) }

test('source import → exact human review → opportunity; retry preserves ids and source revision invalidates commercial use', t => {
  const f = fixture(); t.after(() => f.db.close()); const connected = link(f), input = catalog()
  connected.open(input)
  const product = f.db.list('product')[0]!, passport = f.db.require('passport', product.id)
  assert.equal(f.service.readiness(product.id).status, 'DATA_INCOMPLETE')
  assert.equal(passport.facts['commercial.moq']!.status, 'AI_INFERRED')
  const projection = { company: Boolean(f.db.get('company', f.factory.subjectId)), products: f.db.list('product').length, factStatus: passport.facts['commercial.moq']!.status, visibility: passport.facts['commercial.moq']!.visibility, sourceRevision: connected.status(f.factory)!.sources.find(r => r.kind === 'passport')!.sourceRevision, readiness: f.service.readiness(product.id).status }
  assert.deepEqual(projection, JSON.parse(readFileSync(new URL('./expected/enterprise.json', import.meta.url), 'utf8')))
  f.confirm(f.factory, 'company'); f.confirm(f.factory, 'passport', product.id)
  const opportunity = f.opportunity(product.id)
  assert.equal(f.service.available(opportunity), true)
  const reviewed = f.db.require('passport', product.id)
  connected.open(input)
  assert.equal(f.db.list('product').length, 1)
  assert.deepEqual(f.db.require('passport', product.id), reviewed)
  input.products[0]!.revision = 2
  input.products[0]!.facts['commercial.moq']!.value = 60
  connected.open(input)
  assert.equal(f.service.available(opportunity), false)
  assert.equal(f.db.require('passport', product.id).facts['commercial.moq']!.value, 60)
  assert.equal(f.db.require('passport', product.id).facts['commercial.moq']!.status, 'AI_INFERRED')
  assert.ok(f.db.list('evidence').some(e => e.revoked))
})

test('source removals revoke evidence; conflicting local values reject the complete refresh', t => {
  const f = fixture(); t.after(() => f.db.close()); const connected = link(f), input = catalog()
  connected.open(input); const product = f.db.list('product')[0]!
  f.confirm(f.factory, 'company'); f.confirm(f.factory, 'passport', product.id)
  const opportunity = f.opportunity(product.id)
  connected.open({ ...input, products: [] })
  assert.equal(f.service.available(opportunity), false)
  connected.open(input)
  const p = f.db.require('passport', product.id)
  f.send(f.factory, 'product.save', { id: product.id, expectedRevision: p.revision, facts: { 'commercial.moq': fact(99) } })
  const before = f.db.list('evidence')
  input.products[0]!.revision++
  assert.throws(() => connected.open(input), /enterprise_import_conflict/)
  assert.equal(f.db.require('passport', product.id).facts['commercial.moq']!.value, 99)
  assert.deepEqual(f.db.list('evidence'), before)
  assert.deepEqual(connected.authenticate(connected.exchange(connected.resume().code).token), f.factory)
  assert.deepEqual(f.db.list('evidence'), before)
})

test('only the server link can transfer records; handoffs are single-use, expiring and factory-scoped', async t => {
  const f = fixture(); t.after(() => f.db.close()); const connected = link(f)
  const http = handler({ service: f.service, credentials: [], maxBodyBytes: 100000, enterprise: connected })
  const call = (path: string, body?: unknown, bearer?: string) => http(new Request(`http://localhost/api/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }))
  assert.equal((await call('integration/open', catalog(), 'wrong')).status, 401)
  const opened = await (await call('integration/open', catalog(), token)).json() as { code: string }
  const session = await (await call('integration/exchange', { code: opened.code })).json() as { token: string }
  assert.equal((await call('integration/exchange', { code: opened.code })).status, 401)
  const workspace = await (await call('workspace', undefined, session.token)).json() as { role: string; subjectId: string }
  assert.equal(workspace.role, 'factory'); assert.equal(workspace.subjectId, f.factory.subjectId)
  assert.equal((await call('integration/open', catalog(), session.token)).status, 401)
  assert.equal((await call('commands', { requestId: key(), type: 'match.run' }, session.token)).status, 403)
  await call('integration/logout', {}, session.token)
  assert.equal((await call('workspace', undefined, session.token)).status, 401)
  const expiring = connected.open(catalog()).code
  f.setTime('2026-09-21T08:01:00.001Z')
  assert.throws(() => connected.exchange(expiring), /handoff_expired/)
  const longer = connected.exchange(connected.open(catalog()).code).token
  const rotated = new EnterpriseLink(f.service, { ...connected.config, token: 'rotated-integration-credential-value' })
  assert.equal(rotated.authenticate(longer), null)
  const rebound = new EnterpriseLink(f.service, { ...connected.config, factoryId: key() })
  assert.equal(rebound.authenticate(longer), null)
  f.setTime('2026-09-21T09:02:00.000Z')
  assert.equal(connected.authenticate(longer), null)
})

test('duplicate sources reject before mutation and malformed handoff responses never create navigation URLs', async t => {
  const f = fixture(); t.after(() => f.db.close()); const connected = link(f), input = catalog()
  input.products.push(input.products[0]!)
  assert.throws(() => connected.open(input), /Product source ids must be unique/)
  assert.equal(f.db.list('company').length, 0)
  const config = { url: 'http://127.0.0.1:3100/', token, timeoutMs: 1000, maxBodyBytes: 100000 }
  await assert.rejects(openCommerce(config, catalog(), new AbortController().signal, async () => Response.json({ code: 'javascript:invalid', records: 2 })))
})

test('existing GEO exports are private source drafts, omit retired products and never invent factory status or price', () => {
  const profile = profileSchema.parse({ name: 'Fixture Textile', kind: 'enterprise', description: '', business: '', website: '', contact: '', email: '', phone: '', address: '', logoId: null })
  const original = geoRecord.parse({ id: key(), revision: 1, sessionId: 'fixture', kind: 'product', name: 'Cloth', description: 'Synthetic cloth', sections: [], questions: '', status: 'confirmed', createdBy: 'user', updatedAt: '2026-09-20T00:00:00.000Z', confirmedAt: '2026-09-20T00:00:00.000Z' })
  const replacement = geoRecord.parse({ ...original, id: key(), supersedesId: original.id, name: 'Cloth revised' })
  const output = exportCommerce(profile, [original, replacement])
  assert.equal(output.products.length, 1)
  assert.equal(output.products[0]!.sourceId, replacement.id)
  assert.equal(output.company!.facts.legal_name, undefined)
  assert.equal(output.company!.facts.factory_status, undefined)
  assert.equal(output.products[0]!.facts['commercial.cost'], undefined)
  assert.deepEqual(exportCommerce(null, []), { version: 1, company: null, products: [] })
})

test('enterprise server forwards only configured credentials and returns a one-use URL, refusing redirects and oversized transfers', async () => {
  const config = { url: 'http://127.0.0.1:3100/', token, timeoutMs: 1000, maxBodyBytes: 100000 }
  const result = await openCommerce(config, catalog(), new AbortController().signal, async (url, init) => {
    assert.equal(String(url), `${config.url}api/integration/open`)
    assert.equal(init?.redirect, 'error'); assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token}`)
    return Response.json({ code: 'x'.repeat(43), records: 2 })
  })
  assert.equal(result, `${config.url}#handoff=${'x'.repeat(43)}`)
  assert.ok(!result.includes(token))
  await assert.rejects(openCommerce({ ...config, maxBodyBytes: 1 }, catalog(), new AbortController().signal), /commerceTransferTooLarge/)
})
