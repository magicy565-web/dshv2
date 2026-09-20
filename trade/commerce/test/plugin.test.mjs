/** External onboarding uses stable HTTP commands without opening business storage. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { call } from '../plugins/commerce-workbuddy/scripts/api.mjs'

test('plugin translates stable factory operations and rejects remote cleartext or unsupported actions', async () => {
  const requests = []
  const config = { url: 'http://127.0.0.1:3000', token: 'fixture-agent-token-over-32-characters', fetch: async (url, init) => { requests.push({ url: String(url), ...init }); return Response.json({ id: 'fixture' }) } }
  await call('create_company', { requestId: 'fixture', facts: {} }, config)
  assert.equal(JSON.parse(requests[0].body).type, 'company.save')
  await call('get_missing_fields', { id: 'product' }, config)
  assert.equal(requests[1].url, 'http://127.0.0.1:3000/api/products/readiness?id=product')
  await assert.rejects(call('publish', {}, config), /Unsupported/)
  await assert.rejects(call('workspace', {}, { ...config, url: 'http://untrusted.example' }), /HTTPS/)
  assert.equal(requests.length, 2)
})
