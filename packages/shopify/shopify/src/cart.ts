import type { ShopifyGraphqlClient } from './client.ts'

export interface CartLineInput { readonly merchandiseId: string; readonly quantity: number }
export interface CartLine { readonly id: string; readonly merchandiseId: string; readonly quantity: number; readonly cost: { readonly amountPerQuantity: string; readonly subtotalAmount: string; readonly totalAmount: string; readonly currencyCode: string } }
export interface CartSnapshot { readonly id: string; readonly lines: readonly CartLine[]; readonly totalAmount: string; readonly subtotalAmount: string; readonly totalTaxAmount?: string; readonly currencyCode: string; readonly checkoutUrl: string; readonly updatedAt: string }

interface CartPayload { cart: { id: string; checkoutUrl: string; updatedAt: string; lines: { nodes: CartLine[] }; cost: { subtotalAmount: { amount: string; currencyCode: string }; totalAmount: { amount: string; currencyCode: string }; totalTaxAmount?: { amount: string } } } }

const CART_FIELDS = `id checkoutUrl updatedAt lines(first: 100) { nodes { id quantity merchandise { ... on ProductVariant { id } } cost { amountPerQuantity { amount currencyCode } subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } } } } cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } totalTaxAmount { amount } }`

/** Typed Storefront Cart API operations for Agentive Shopping. */
export class StorefrontCartClient {
  constructor(private readonly client: ShopifyGraphqlClient) {}

  /** Create a cart and return the first immutable snapshot. */
  async create(lines: readonly CartLineInput[], buyerIdentity?: Readonly<Record<string, unknown>>): Promise<CartSnapshot> {
    const data = await this.client.execute<{ cartCreate: { cart: CartPayload['cart']; userErrors: Array<{ message: string }> } }>(`mutation CartCreate($input: CartInput!) { cartCreate(input: $input) { cart { ${CART_FIELDS} } userErrors { message } } }`, { input: { lines, buyerIdentity } })
    return this.unwrap(data.cartCreate)
  }

  /** Add lines to an existing cart. */
  async add(cartId: string, lines: readonly CartLineInput[]): Promise<CartSnapshot> { return this.mutate('cartLinesAdd', cartId, lines) }
  /** Replace quantities for existing line IDs. */
  async update(cartId: string, lines: readonly { readonly id: string; readonly quantity: number }[]): Promise<CartSnapshot> { return this.mutate('cartLinesUpdate', cartId, lines) }
  /** Remove existing line IDs. */
  async remove(cartId: string, lineIds: readonly string[]): Promise<CartSnapshot> {
    const data = await this.client.execute<{ cartLinesRemove: { cart: CartPayload['cart']; userErrors: Array<{ message: string }> } }>(`mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FIELDS} } userErrors { message } } }`, { cartId, lineIds })
    return this.unwrap(data.cartLinesRemove)
  }
  private async mutate(operation: 'cartLinesAdd' | 'cartLinesUpdate', cartId: string, lines: readonly unknown[]): Promise<CartSnapshot> {
    const data = await this.client.execute<Record<string, { cart: CartPayload['cart']; userErrors: Array<{ message: string }> }>>(`mutation CartLines($cartId: ID!, $lines: [CartLineInput!]!) { ${operation}(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { message } } }`, { cartId, lines })
    return this.unwrap(data[operation]!)
  }
  private unwrap(payload: { cart: CartPayload['cart']; userErrors: Array<{ message: string }> }): CartSnapshot {
    if (payload.userErrors.length) throw new Error(`Shopify cart validation failed: ${payload.userErrors.map(error => error.message).join('; ')}`)
    const cart = payload.cart; if (!cart) throw new Error('Shopify cart response did not contain a cart')
    return { id: cart.id, checkoutUrl: cart.checkoutUrl, updatedAt: cart.updatedAt, lines: cart.lines.nodes, subtotalAmount: cart.cost.subtotalAmount.amount, totalAmount: cart.cost.totalAmount.amount, currencyCode: cart.cost.totalAmount.currencyCode, ...(cart.cost.totalTaxAmount ? { totalTaxAmount: cart.cost.totalTaxAmount.amount } : {}) }
  }
}
