import { describe, expect, it, vi } from 'vitest'
import { StorefrontCartClient } from '../src/cart.ts'

const cart = { id: 'gid://cart/1', checkoutUrl: 'https://checkout.test/1', updatedAt: '2026-09-15T00:00:00Z', lines: { nodes: [] }, cost: { subtotalAmount: { amount: '10.00', currencyCode: 'USD' }, totalAmount: { amount: '12.00', currencyCode: 'USD' }, totalTaxAmount: { amount: '2.00' } } }

describe('StorefrontCartClient', () => {
  it('creates a cart and returns a normalized snapshot', async () => {
    const execute = vi.fn(async () => ({ cartCreate: { cart, userErrors: [] } }))
    const client = new StorefrontCartClient({ execute } as never)
    await expect(client.create([{ merchandiseId: 'gid://variant/1', quantity: 1 }])).resolves.toMatchObject({ id: cart.id, totalAmount: '12.00', currencyCode: 'USD' })
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('surfaces Shopify user errors', async () => {
    const client = new StorefrontCartClient({ execute: vi.fn(async () => ({ cartCreate: { cart: null, userErrors: [{ message: 'variant unavailable' }] } })) } as never)
    await expect(client.create([])).rejects.toThrow(/variant unavailable/)
  })
})
