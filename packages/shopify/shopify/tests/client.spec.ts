import { describe, expect, it, vi } from 'vitest'
import { ShopifyApiError, ShopifyGraphqlClient, verifyShopifyHmac } from '../src/index.ts'
import { createHmac } from 'node:crypto'

describe('Shopify GraphQL client', () => {
  it('uses the API-specific endpoint and classifies GraphQL errors', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { shop: { name: 'Demo' } } }), { status: 200, headers: { 'x-request-id': 'r1' } }))
    const client = new ShopifyGraphqlClient({ shopDomain: 'demo.myshopify.com', accessToken: 'token', apiVersion: '2026-04', kind: 'admin', fetch: request })
    await expect(client.execute<{ shop: { name: string } }>('query { shop { name } }')).resolves.toEqual({ shop: { name: 'Demo' } })
    expect(request.mock.calls[0]?.[0]).toContain('/admin/api/2026-04/graphql.json')
  })

  it('verifies HMAC and rejects altered values', () => {
    const payload = 'code=abc&shop=demo.myshopify.com&state=s1'; const secret = 'secret'
    const digest = createHmac('sha256', secret).update(payload).digest('hex')
    expect(verifyShopifyHmac(payload, digest, secret)).toBe(true)
    expect(verifyShopifyHmac(payload, `${digest}0`, secret)).toBe(false)
  })

  it('classifies permission failures without retrying', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'forbidden' }] }), { status: 403 }))
    const client = new ShopifyGraphqlClient({ shopDomain: 'demo.myshopify.com', accessToken: 'token', apiVersion: '2026-04', kind: 'admin', fetch: request })
    await expect(client.execute('query { shop { name } }')).rejects.toMatchObject({ kind: 'permission' } satisfies Partial<ShopifyApiError>)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
