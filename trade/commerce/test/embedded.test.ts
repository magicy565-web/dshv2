/** Native enterprise controls use the same authenticated business API without browser tokens. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fixture, fact, key } from './fixture.ts'
import { handler } from '../src/http.ts'
import { EnterpriseLink } from '../src/enterprise-link.ts'
import { dispatchCommerce } from '../../enterprise/src/commerce-dispatch.ts'

const secret = 'synthetic-embedded-server-credential'
function setup() {
  const f = fixture()
  const config = { url: 'http://commerce.test/', token: secret, merchantId: f.merchant.subjectId, timeoutMs: 1000, maxBodyBytes: 100000 }
  const link = new EnterpriseLink(f.service, { token: secret, factoryId: f.factory.subjectId, merchantId: f.merchant.subjectId, returnUrl: 'http://127.0.0.1:3080/', ticketTtlMs: 60000, sessionTtlMs: 3600000 })
  const api = handler({ service: f.service, enterprise: link, credentials: [{ ...f.factory, token: 'synthetic-factory-human-credential' }], maxBodyBytes: 100000 })
  const transport: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'http://commerce.test/api/integration/dispatch')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('authorization'), `Bearer ${secret}`)
    assert.equal(headers.get('cookie'), null)
    assert.equal(init?.redirect, 'error')
    return api(new Request(url, init))
  }
  const dispatch = (input: unknown) => dispatchCommerce(config, input, new AbortController().signal, transport)
  return { ...f, config, link, api, dispatch }
}

test('embedded factory mutations and merchant views preserve the original API permissions and stored records', async t => {
  const f = setup(); t.after(() => f.db.close())
  const save = { type: 'company.save', requestId: key(), id: f.factory.subjectId, expectedRevision: 0, facts: { legal_name: fact('Embedded Fixture Factory') } }
  const written = await f.dispatch({ role: 'factory', method: 'POST', route: 'commands', body: save })
  assert.equal(written.status, 200)
  assert.equal((await f.dispatch({ role: 'factory', method: 'POST', route: 'commands', body: save })).status, 200)
  assert.equal(f.db.list('company').length, 1)
  const factory = await (await f.dispatch({ role: 'factory', method: 'GET', route: 'workspace' })).json()
  const merchant = await (await f.dispatch({ role: 'merchant', method: 'GET', route: 'workspace' })).json()
  const denied = await f.dispatch({ role: 'merchant', method: 'POST', route: 'commands', body: { ...save, requestId: key() } })
  assert.equal(denied.status, 403)
  assert.equal(JSON.stringify(factory).includes(secret), false)
  assert.equal(JSON.stringify(merchant).includes('Embedded Fixture Factory'), false)
  assert.equal(f.db.db.prepare('SELECT count(*) AS n FROM linked_sessions').get()!.n, 0)
  assert.deepEqual({ factoryRole: factory.role, factoryName: factory.company.facts.legal_name.value, merchantRole: merchant.role, merchantCompanyVisible: 'company' in merchant, crossRoleMutationStatus: denied.status, browserTokensCreated: 0 }, JSON.parse(readFileSync(new URL('./expected/embedded.json', import.meta.url), 'utf8')))
})

test('dispatch requires the server credential, rejects browser origins and cannot choose arbitrary subjects or routes', async t => {
  const f = setup(); t.after(() => f.db.close())
  const input = { role: 'factory', method: 'GET', route: 'workspace' }
  const send = (body: unknown, token = secret, extra = {}) => f.api(new Request('http://commerce.test/api/integration/dispatch', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }))
  assert.equal((await send(input, 'synthetic-factory-human-credential')).status, 401)
  assert.equal((await send(input, secret, { origin: 'http://127.0.0.1:3080' })).status, 401)
  for (const body of [{ ...input, subjectId: key() }, { ...input, route: 'integration/open' }, { ...input, route: 'https://other.test/' }, { ...input, role: 'admin' }, { ...input, method: 'POST', route: 'workspace' }]) assert.equal((await send(body)).status, 400)
  const blocked = await dispatchCommerce({ ...f.config, merchantId: undefined }, { ...input, role: 'merchant' }, new AbortController().signal, async () => { throw new Error('Unprovisioned merchant must not reach transport') })
  assert.equal(blocked.status, 403)
})

test('enterprise forwarding bounds both directions, preserves business refusals and propagates cancellation', async t => {
  const f = setup(); t.after(() => f.db.close())
  const input = { role: 'factory', method: 'GET', route: 'workspace' }
  const oversized = await dispatchCommerce({ ...f.config, maxBodyBytes: 5 }, input, new AbortController().signal, async () => { throw new Error('Oversized input must not reach transport') })
  assert.equal(oversized.status, 413)
  const response = await dispatchCommerce(f.config, input, new AbortController().signal, async () => Response.json({ error: 'approval_stale' }, { status: 409, headers: { 'set-cookie': 'upstream-private-cookie' } }))
  assert.equal(response.status, 409); assert.equal(response.headers.get('set-cookie'), null)
  const largeResponse = await dispatchCommerce({ ...f.config, maxBodyBytes: 100 }, input, new AbortController().signal, async () => Response.json({ text: 'x'.repeat(101) }))
  assert.equal(largeResponse.status, 503)
  const controller = new AbortController(); controller.abort()
  const aborted = await dispatchCommerce(f.config, input, controller.signal, async (_url, init) => { assert.equal(init?.signal?.aborted, true); throw new DOMException('Aborted', 'AbortError') })
  assert.equal(aborted.status, 503)
  const invalid = await dispatchCommerce(f.config, input, new AbortController().signal, async () => new Response('private upstream diagnostic', { status: 502 }))
  assert.deepEqual(await invalid.json(), { error: 'commerce_unavailable' })
})
