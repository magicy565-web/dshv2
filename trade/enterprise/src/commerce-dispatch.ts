/** Server-only forwarding for business controls mounted inside the enterprise UI. */
import { z } from 'zod'
import { embeddedRequest } from '../../commerce/src/embedded-wire.ts'
import type { commerceLinkConfig } from './commerce-link.ts'

/** Forward one allowed operation with a deployment credential, never the browser cookie.
 * @param config - Fixed Commerce destination and bounded transport settings.
 * @param input - Allowed operation and server-provisioned role.
 * @param signal - Host shutdown or incoming-request cancellation.
 * @param transport - Instance-owned HTTP transport.
 * @returns JSON response with the business API's status; no upstream credentials or headers.
 */
export async function dispatchCommerce(config: z.infer<typeof commerceLinkConfig>, input: unknown, signal: AbortSignal, transport: typeof fetch = fetch): Promise<Response> {
  const operation = embeddedRequest.parse(input)
  if (operation.role === 'merchant' && !config.merchantId) return Response.json({ error: 'forbidden' }, { status: 403 })
  const body = JSON.stringify(operation)
  if (Buffer.byteLength(body) > config.maxBodyBytes) return Response.json({ error: 'body_too_large' }, { status: 413 })
  try {
    const result = await transport(new URL('api/integration/dispatch', config.url), { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]), headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` }, body })
    const reader = result.body?.getReader()
    if (!reader) throw new Error('Empty Commerce response')
    let size = 0; const parts: Uint8Array[] = []
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > config.maxBodyBytes) { await reader.cancel(); throw new Error('Commerce response exceeds limit') } parts.push(chunk.value) } }
    finally { reader.releaseLock() }
    const value: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'))
    return Response.json(value, { status: result.status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
  } catch { return Response.json({ error: 'commerce_unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } }) }
}
