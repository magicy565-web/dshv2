/** Authenticated server-to-server launch; deployment secrets never enter a browser URL. */
import { z } from 'zod'
import { enterpriseTransfer } from '../../commerce/src/enterprise-wire.ts'
import type { EnterpriseTransfer } from '../../commerce/src/enterprise-wire.ts'

/** Explicit deployment target and bounded request lifetime. */
export const commerceLinkConfig = z.object({
  url: z.url().refine(v => { const u = new URL(v); return !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) }),
  token: z.string().min(32), merchantId: z.uuid().optional(), timeoutMs: z.number().int().positive(), maxBodyBytes: z.number().int().positive(),
}).strict()

/** Synchronize the existing catalog and obtain a one-use navigation URL.
 * @param config - Server-owned destination and credential.
 * @param snapshot - Source records with review provenance, or null to open saved records without refreshing.
 * @param signal - Host shutdown or browser cancellation.
 * @param transport - Injectable HTTP transport.
 * @param role - Human role selected through the existing enterprise entry.
 * @returns Navigation URL containing only a short-lived single-use code.
 */
export async function openCommerce(config: z.infer<typeof commerceLinkConfig>, snapshot: EnterpriseTransfer | null, signal: AbortSignal, transport: typeof fetch = fetch, role: 'factory' | 'merchant' = 'factory'): Promise<string> {
  if (role === 'merchant' && (!config.merchantId || snapshot !== null)) throw new Error('commerceUnavailable')
  const body = JSON.stringify(snapshot === null ? { role } : enterpriseTransfer.parse(snapshot))
  if (Buffer.byteLength(body) > config.maxBodyBytes) throw new Error('commerceTransferTooLarge')
  const response = await transport(new URL(snapshot === null ? 'api/integration/resume' : 'api/integration/open', config.url), { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]), headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }, body })
  const reader = response.body?.getReader()
  if (!reader) throw new Error('commerceUnavailable')
  const parts: Uint8Array[] = []; let size = 0
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > config.maxBodyBytes) { await reader.cancel(); throw new Error('commerceUnavailable') } parts.push(chunk.value) } }
  finally { reader.releaseLock() }
  const json: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'))
  if (!response.ok) {
    const error = z.object({ error: z.string() }).parse(json).error
    throw new Error(error === 'enterprise_import_conflict' ? 'commerceImportConflict' : error === 'publication_requires_reconciliation' ? 'commercePublicationPending' : 'commerceUnavailable')
  }
  const { code } = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), records: z.number().int().nonnegative() }).strict().parse(json)
  return `${config.url}#handoff=${code}`
}
