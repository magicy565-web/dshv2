import { createHmac, timingSafeEqual } from 'node:crypto'

export type ShopifyApiKind = 'admin' | 'storefront'
export type ShopifyErrorKind = 'authentication' | 'permission' | 'not-found' | 'validation' | 'rate-limit' | 'transient' | 'permanent'

export class ShopifyApiError extends Error {
  constructor(readonly kind: ShopifyErrorKind, message: string, readonly requestId?: string, readonly retryAfterMs?: number) {
    super(message); this.name = 'ShopifyApiError'
  }
}

export interface ShopifyGraphqlClientOptions {
  readonly shopDomain: string
  readonly accessToken: string
  readonly apiVersion: string
  readonly kind: ShopifyApiKind
  readonly buyerIp?: string
  readonly fetch?: typeof globalThis.fetch
  readonly maxAttempts?: number
}

/** Minimal Shopify GraphQL transport with error classification and bounded retries. */
export class ShopifyGraphqlClient {
  private readonly request: typeof globalThis.fetch
  constructor(private readonly options: ShopifyGraphqlClientOptions) { this.request = options.fetch ?? globalThis.fetch }

  /** Execute one GraphQL operation against Admin or Storefront API. */
  async execute<T>(query: string, variables: Readonly<Record<string, unknown>> = {}): Promise<T> {
    const endpoint = this.options.kind === 'admin'
      ? `https://${this.options.shopDomain}/admin/api/${this.options.apiVersion}/graphql.json`
      : `https://${this.options.shopDomain}/api/${this.options.apiVersion}/graphql.json`
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.options.kind === 'admin') headers['X-Shopify-Access-Token'] = this.options.accessToken
    else headers['X-Shopify-Storefront-Access-Token'] = this.options.accessToken
    if (this.options.buyerIp !== undefined) headers['Shopify-Storefront-Buyer-IP'] = this.options.buyerIp
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3)
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response
      try { response = await this.request(endpoint, { method: 'POST', headers, body: JSON.stringify({ query, variables }) }) }
      catch (error) { if (attempt === maxAttempts) throw new ShopifyApiError('transient', String(error)); await delay(backoff(attempt)); continue }
      const requestId = response.headers.get('x-request-id') ?? undefined
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxAttempts) throw new ShopifyApiError(response.status === 429 ? 'rate-limit' : 'transient', `Shopify HTTP ${response.status}`, requestId, retryAfterMs)
        await delay(retryAfterMs ?? backoff(attempt)); continue
      }
      const body = await response.json() as { data?: T; errors?: Array<{ message?: string; extensions?: { code?: string } }> }
      if (!response.ok || body.errors?.length) throw classifyError(response.status, body.errors?.map(error => error.message ?? 'GraphQL error').join('; ') ?? `Shopify HTTP ${response.status}`, requestId)
      if (body.data === undefined) throw new ShopifyApiError('permanent', 'Shopify response did not contain data', requestId)
      return body.data
    }
    throw new ShopifyApiError('transient', 'Shopify request exhausted retries')
  }
}

/** Verify Shopify OAuth/Webhook HMAC using a timing-safe comparison. */
export function verifyShopifyHmac(payload: string | URLSearchParams, provided: string, secret: string): boolean {
  const raw = typeof payload === 'string'
    ? payload
    : [...payload.entries()]
      .filter(([key]) => key !== 'hmac' && key !== 'signature')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&')
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const left = Buffer.from(expected, 'utf8'); const right = Buffer.from(provided, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

function classifyError(status: number, message: string, requestId?: string): ShopifyApiError {
  const lower = message.toLowerCase()
  const kind: ShopifyErrorKind = status === 401 ? 'authentication' : status === 403 ? 'permission' : status === 404 ? 'not-found' : status === 422 || lower.includes('validation') ? 'validation' : status >= 500 ? 'transient' : 'permanent'
  return new ShopifyApiError(kind, message, requestId)
}
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined
}
function backoff(attempt: number): number { return Math.min(5000, 250 * 2 ** (attempt - 1)) }
function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }
