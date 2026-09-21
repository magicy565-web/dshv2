/** Authenticated editor HTTP adapter; the host owns routing and identity resolution. */
import type { TenantId, StoreConnectionId } from '@deepseek-ai/dsh-shopify'
import type { SiteService } from './index.ts'
import type { SiteSpec } from './index.ts'
import { PublishJobId, SiteId, SiteRevisionId } from './types.ts'
import { parseSiteChangeSet } from './snapshot.ts'

/** Required host policies for the editor adapter. */
export interface SiteHttpOptions {
  /** Resolve identity from trusted authentication, never request JSON. */
  readonly authenticate: (request: Request) => Promise<TenantId | undefined>
  /** Reject store connections unavailable to this tenant before creating a site. */
  readonly authorizeConnection: (tenantId: TenantId, connectionId: StoreConnectionId) => Promise<void>
  /** Origin used for private preview canonical URLs. */
  readonly publicOrigin: string
  /** Maximum UTF-8 JSON request bytes, including envelopes. */
  readonly maxBodyBytes: number
  /** Verify deployment-owned publication and in-flight work before archival or deletion. */
  readonly beforeManage?: (spec: SiteSpec, operation: 'archive' | 'delete') => void
  /** Remove deployment-owned records after the durable deletion receipt commits. */
  readonly onDeleted?: (spec: SiteSpec) => void
}

class InputError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function field(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(400, `${name} must be a nonempty string`)
  return value
}

async function body(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.split(';')[0]?.trim().match(/^application\/json$/i)) throw new InputError(415, 'application/json is required')
  const reader = request.body?.getReader()
  if (!reader) throw new InputError(400, 'JSON body is required')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new InputError(413, 'site request exceeds the configured byte limit')
      }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required')
    return value as Record<string, unknown>
  } catch { throw new InputError(400, 'JSON object is required') }
}

/** Create an authenticated editor handler mounted at a host-owned prefix.
 * @param sites - Site service, normally the persistent provider.
 * @param options - Host authentication, connection authorization and request limits.
 * @returns Handler accepting a relative route such as /sites or /sites/id/revisions.
 */
export function createSiteHttpHandler(
  sites: SiteService, options: SiteHttpOptions,
): (request: Request, route: string) => Promise<Response> {
  if (!Number.isSafeInteger(options.maxBodyBytes) || options.maxBodyBytes < 1) throw new Error('maxBodyBytes must be a positive safe integer')
  const origin = new URL(options.publicOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('publicOrigin must use HTTP(S) without credentials')
  const json = (value: unknown, status = 200): Response => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
  return async (request, route) => {
    const tenantId = await options.authenticate(request)
    if (!tenantId) return json({ error: 'authentication required' }, 401)
    try {
      const parts = route.split('/').filter(Boolean)
      if (parts[0] !== 'sites' || parts.length > 3) return json({ error: 'not found' }, 404)
      const siteId = parts[1]
      if (siteId === undefined) {
        if (request.method === 'GET') return json({ items: sites.list(tenantId) })
        if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
        const input = await body(request, options.maxBodyBytes)
        const name = field(input.name, 'name')
        const connectionId = input.connectionId === undefined ? undefined : field(input.connectionId, 'connectionId') as StoreConnectionId
        if (connectionId !== undefined) await options.authorizeConnection(tenantId, connectionId)
        return json(sites.createSite(tenantId, name, connectionId), 201)
      }
      const spec = { tenantId, siteId: SiteId(siteId) }
      if (!sites.get(spec)) return json({ error: 'site not found' }, 404)
      const action = parts[2]
      const methods = action === 'revisions' ? ['GET', 'POST']
        : action === undefined || ['jobs', 'content', 'diff', 'preview', 'artifact'].includes(action) ? ['GET']
          : ['rollback', 'cancel', 'publish', 'manage', 'delete'].includes(action) ? ['POST'] : undefined
      if (!methods) return json({ error: 'not found' }, 404)
      if (!methods.includes(request.method)) return json({ error: 'method not allowed' }, 405)
      const query = new URL(request.url).searchParams
      if (request.method === 'GET') {
        if (action === undefined) return json(sites.get(spec))
        if (action === 'revisions') return json({ items: sites.listRevisions(spec) })
        if (action === 'jobs') return json({ items: sites.listPublishJobs(spec) })
        const revisionId = SiteRevisionId(field(query.get('revisionId'), 'revisionId'))
        if (!sites.getRevision(spec, revisionId)) return json({ error: 'revision not found' }, 404)
        if (action === 'content') return json(sites.content(spec, revisionId))
        if (action === 'artifact') {
          try { return json(sites.build(spec, revisionId)) }
          catch (error) { return json({ error: error instanceof Error ? error.message : 'site build failed' }, 422) }
        }
        if (action === 'diff') {
          const base = query.get('baseRevisionId')
          if (base && !sites.getRevision(spec, SiteRevisionId(base))) return json({ error: 'base revision not found' }, 404)
          return json(sites.diff(spec, revisionId, base ? SiteRevisionId(base) : undefined))
        }
        if (action === 'preview') {
          if (sites.content(spec, revisionId).project) {
            try {
              return await sites.renderArtifact(sites.build(spec, revisionId), query.get('path') ?? '/', (path) => {
                const url = new URL(request.url)
                url.searchParams.set('path', path)
                return `${url.pathname}${url.search}`
              }, options.maxBodyBytes, true)
            }
            catch (error) { return json({ error: error instanceof Error ? error.message : 'site build failed' }, 422) }
          }
          const pageId = field(query.get('pageId'), 'pageId')
          if (!sites.content(spec, revisionId).pages.some(page => page.id === pageId)) return json({ error: 'page not found' }, 404)
          return new Response(sites.preview(spec, revisionId, pageId, origin.origin), { headers: {
            'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
            'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'",
          } })
        }
        return json({ error: 'not found' }, 404)
      }
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
      const input = await body(request, options.maxBodyBytes)
      if (action === 'manage' || action === 'delete') {
        if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) return json({ error: 'expectedVersion must be a nonnegative integer' }, 400)
        if (input.confirmed !== true) return json({ error: 'management confirmation required' }, 400)
        if (action === 'manage' && ((input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 160)) || (input.archived !== undefined && typeof input.archived !== 'boolean') || (input.name === undefined && input.archived === undefined))) return json({ error: 'invalid site management request' }, 400)
        try {
          if (action === 'delete') {
            options.beforeManage?.(spec, 'delete')
            sites.deleteSite(spec, Number(input.expectedVersion))
            options.onDeleted?.(spec)
            return json({ deleted: true })
          }
          if (input.archived === true) options.beforeManage?.(spec, 'archive')
          return json(sites.manage(spec, Number(input.expectedVersion), { ...(typeof input.name === 'string' ? { name: input.name } : {}), ...(typeof input.archived === 'boolean' ? { archived: input.archived } : {}) }))
        } catch { return json({ error: 'site management refused; refresh and ensure the site is offline and has no pending work' }, 409) }
      }
      if (sites.get(spec)?.archived && action !== undefined && ['revisions', 'rollback', 'publish'].includes(action)) return json({ error: 'restore the archived site before editing or publishing' }, 409)
      if (action === 'revisions') {
        let changes
        try { changes = parseSiteChangeSet(input.changeSet) } catch { throw new InputError(400, 'invalid site change set') }
        const current = sites.get(spec)?.currentRevisionId
        if (changes.baseRevisionId !== current) return json({ error: 'site revision conflict' }, 409)
        return json(await sites.createRevision(spec, changes, 'user'), 201)
      }
      if (action === 'rollback') {
        const current = sites.get(spec)?.currentRevisionId
        if (input.expectedRevisionId !== current) return json({ error: 'site revision conflict' }, 409)
        const target = SiteRevisionId(field(input.revisionId, 'revisionId'))
        if (!sites.getRevision(spec, target)) return json({ error: 'revision not found' }, 404)
        return json(await sites.rollback(spec, target), 201)
      }
      if (action === 'cancel') {
        const jobId = PublishJobId(field(input.jobId, 'jobId'))
        const job = sites.getPublishJob(spec, jobId)
        if (!job) return json({ error: 'job not found' }, 404)
        if (job.status !== 'queued' && job.status !== 'cancelled') return json({ error: 'job cannot be cancelled' }, 409)
        return json(await sites.cancelPublishJob(spec, jobId))
      }
      if (action === 'publish') {
        const revisionId = SiteRevisionId(field(input.revisionId, 'revisionId'))
        if (!sites.getRevision(spec, revisionId)) return json({ error: 'revision not found' }, 404)
        if (input.expectedRevisionId !== undefined && input.expectedRevisionId !== sites.get(spec)?.currentRevisionId) return json({ error: 'site revision conflict' }, 409)
        return json(await sites.queuePublishJob(spec, revisionId), 202)
      }
      return json({ error: 'not found' }, 404)
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, error.status)
      throw error
    }
  }
}
