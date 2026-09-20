import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { buildOAuthUrl, createOAuthState, exchangeOfflineToken, validateOAuthCallback } from '../src/index.ts'

const config = { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://app.test/callback', scopes: ['read_products', 'write_themes'] }

describe('Shopify OAuth helpers', () => {
  it('builds a scoped authorization URL', () => {
    const state = createOAuthState(); const url = buildOAuthUrl('demo.myshopify.com', state, config)
    expect(url).toContain('client_id=id'); expect(url).toContain('scope=read_products%2Cwrite_themes'); expect(url).toContain(`state=${state}`)
  })
  it('validates state and HMAC before exchange', async () => {
    const callback = { code: 'c', shop: 'demo.myshopify.com', state: 's', hmac: '' }
    callback.hmac = createHmac('sha256', config.clientSecret).update('code=c&shop=demo.myshopify.com&state=s').digest('hex')
    expect(() =>{  validateOAuthCallback(callback, 's', config) }).not.toThrow()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: 'token', scope: 'read_products' }), { status: 200 }))
    await expect(exchangeOfflineToken(callback, config, fetcher)).resolves.toMatchObject({ access_token: 'token' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(() =>{  validateOAuthCallback(callback, 'wrong', config) }).toThrow(/state/)
  })
})
