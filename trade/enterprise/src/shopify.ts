import type { GeoProduct } from './geo-product.ts'

export interface ShopifyProductInput { title: string; handle: string; descriptionHtml: string; vendor: string; productType: string; variants: ShopifyVariantInput[]; media: { originalSource: string; alt: string }[] }
export interface ShopifyVariantInput { externalId: string; sku?: string; barcode?: string; inventoryManagement: null }

export interface ShopifyVariantState { id: string; price?: string; currency?: string; availableForSale?: boolean; inventoryQuantity?: number }
export interface ShopifyAdminClient { sync(input: ShopifyProductInput, existingProductId?: string): Promise<{ productId: string; variantIds: Record<string, string>; variants: ShopifyVariantState[] }> }
export class ShopifyRequestError extends Error { constructor(readonly status: number, message: string) { super(message) } }
export function isRetryableShopifyError(error: unknown): boolean { return error instanceof ShopifyRequestError && (error.status === 429 || error.status >= 500) }

/** Minimal Admin GraphQL client. Credentials come from deployment configuration. */
export function shopifyAdmin(config: { shopDomain: string; accessToken: string; apiVersion: string; fetch?: typeof globalThis.fetch }): ShopifyAdminClient {
  const request = config.fetch ?? globalThis.fetch
  return { async sync(input, existingProductId) {
    const mutation = existingProductId ? 'mutation($input:ProductInput!,$id:ID!){productUpdate(product:$input,productId:$id){product{id variants(first:100){nodes{id legacyResourceId price currencyCode availableForSale inventoryQuantity}}} userErrors{message}}}' : 'mutation($input:ProductInput!){productCreate(product:$input){product{id variants(first:100){nodes{id legacyResourceId price currencyCode availableForSale inventoryQuantity}}} userErrors{message}}}'
    const variables = existingProductId ? { input, id: existingProductId } : { input }
    const response = await request(`https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': config.accessToken }, body: JSON.stringify({ query: mutation, variables }) })
    if (!response.ok) throw new ShopifyRequestError(response.status, `Shopify HTTP ${response.status}`)
    const body = await response.json() as { data?: { productCreate?: ShopifyPayload; productUpdate?: ShopifyPayload }; errors?: Array<{ message: string }> }
    if (body.errors?.length) throw new Error(body.errors.map(error => error.message).join('; '))
    const payload = body.data?.productCreate ?? body.data?.productUpdate
    if (!payload?.product?.id || payload.userErrors?.length) throw new Error(payload?.userErrors?.map((error: { message: string }) => error.message).join('; ') || 'Shopify product sync failed')
    const variantIds: Record<string, string> = {}
    payload.product.variants.nodes.forEach((variant: ShopifyVariantState & { currencyCode?: string }, index: number) => { const source = input.variants[index]; if (source) variantIds[source.externalId] = variant.id })
    return { productId: payload.product.id, variantIds, variants: payload.product.variants.nodes.map((variant: ShopifyVariantState & { currencyCode?: string }) => ({ id: variant.id, ...(variant.price === undefined ? {} : { price: variant.price }), ...(variant.currencyCode === undefined ? {} : { currency: variant.currencyCode }), ...(variant.availableForSale === undefined ? {} : { availableForSale: variant.availableForSale }), ...(variant.inventoryQuantity === undefined ? {} : { inventoryQuantity: variant.inventoryQuantity }) })) }
  } }
}
interface ShopifyPayload { product?: { id: string; variants: { nodes: Array<ShopifyVariantState & { legacyResourceId?: string; currencyCode?: string }> } }; userErrors?: Array<{ message: string }> }

/** Build Shopify input from reviewed GEO facts. Prices and inventory are deliberately absent.
 * @param product - Human-verified GEO product.
 * @param handle - Stable Shopify handle.
 * @returns Product and variant fields accepted by the Admin client.
 */
export function toShopifyProduct(product: GeoProduct, handle: string): ShopifyProductInput {
  const variants = product.variants.map((variant, index) => ({ externalId: variant.id, ...(index === 0 && product.identity.sku ? { sku: product.identity.sku } : {}), ...(index === 0 && product.identity.gtin ? { barcode: product.identity.gtin } : {}), inventoryManagement: null as null }))
  const claims = product.claims.filter(claim => claim.public && claim.status === 'declared' && claim.value.type !== 'unknown')
  const descriptionHtml = `<p>${escapeHtml(product.understanding.directAnswer)}</p>` + claims.map(claim => `<p><strong>${escapeHtml(claim.name)}</strong>: ${escapeHtml(displayValue(claim.value))}</p>`).join('')
  return { title: product.identity.brand ? `${product.identity.brand} ${product.identity.manufacturer.name}` : product.identity.manufacturer.name, handle, descriptionHtml, vendor: product.identity.manufacturer.name, productType: product.identity.category.join(' / '), variants, media: product.media.map(item => ({ originalSource: item.url, alt: item.alt })) }
}
/** Render a typed GEO value for Shopify's description. */
function displayValue(value: GeoProduct['claims'][number]['value']): string { if (value.type === 'text' || value.type === 'number' || value.type === 'boolean') return `${value.value}${value.type === 'number' ? ` ${value.unit}` : ''}`; if (value.type === 'range') return `${value.min}-${value.max} ${value.unit}`; return '' }
/** Escape model-supplied text before embedding it in HTML. */
function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }
