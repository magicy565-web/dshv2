import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptWebhook, oauthAuthorize, publishJob, storeConnection, verifyOAuthHmac, verifyOAuthState, verifyWebhookHmac } from '../src/shopify-site.ts'
import { createHmac } from 'node:crypto'

test('store connections and jobs are tenant-scoped and idempotent', () => {
  const connection = storeConnection({ id: 'store-1', mode: 'oauth', shopDomain: 'example.myshopify.com', status: 'connected', scopes: ['write_products'], createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' })
  const first = publishJob({ id: 'job-1', connectionId: connection.id, productId: 'product-1', revision: 2, status: 'queued', attempts: 0, createdAt: connection.createdAt, updatedAt: connection.updatedAt })
  const second = publishJob({ id: 'job-2', connectionId: connection.id, productId: 'product-1', revision: 2, status: 'queued', attempts: 0, createdAt: connection.createdAt, updatedAt: connection.updatedAt })
  assert.equal(first.idempotencyKey, second.idempotencyKey)
  assert.equal(connection.mode, 'oauth')
})

test('OAuth callback HMAC and webhook deduplication are enforced', () => {
  const values = { code: 'abc', shop: 'example.myshopify.com', state: 'state' }
  const message = Object.keys(values).sort().map(key => `${key}=${values[key]}`).join('&')
  const hmac = createHmac('sha256', 'secret').update(message).digest('hex')
  assert.equal(verifyOAuthHmac({ ...values, hmac }, 'secret'), true)
  assert.equal(verifyOAuthHmac({ ...values, hmac: 'bad' }, 'secret'), false)
  assert.equal(verifyOAuthState('state', 'state'), true)
  assert.equal(verifyOAuthState('other', 'state'), false)
  const seen = new Set()
  assert.equal(acceptWebhook('delivery-1', seen), true)
  assert.equal(acceptWebhook('delivery-1', seen), false)
})

test('OAuth authorize URL preserves explicit redirect and scopes', () => {
  const url = oauthAuthorize({ shopDomain: 'example.myshopify.com', clientId: 'client', redirectUri: 'https://app.example/callback', scopes: ['write_products', 'read_inventory'], state: 'opaque' })
  assert.match(url, /redirect_uri=https%3A%2F%2Fapp.example%2Fcallback/)
  assert.match(url, /scope=write_products%2Cread_inventory/)
})

test('webhook HMAC covers the exact body', () => {
  const body = JSON.stringify({ id: 42 })
  const hmac = createHmac('sha256', 'secret').update(body).digest('base64')
  assert.equal(verifyWebhookHmac(body, hmac, 'secret'), true)
  assert.equal(verifyWebhookHmac(`${body} `, hmac, 'secret'), false)
})
