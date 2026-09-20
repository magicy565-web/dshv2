/** Local enterprise editor adapter on the authenticated Connection carrier. */
import type { Context } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { SqliteSiteStateStore } from '../../../packages/site/site/src/sqlite.ts'
import { createSiteHttpHandler } from '../../../packages/site/site/src/http.ts'
import type { StoreConnectionId, TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { siteTools } from './site-tools.ts'
import { z } from 'zod'
import { SiteHostingStore } from './site-hosting-store.ts'
import { SiteHosting, SiteHostingError } from './site-hosting.ts'
import { SiteId, SiteRevisionId } from '../../../packages/site/site/src/types.ts'
import type { SiteHostingProvider } from './site-hosting-provider.ts'
import { deploymentSchema } from './site-hosting-schema.ts'
import { siteDomainCommand } from './site-domains-schema.ts'

async function hostingBody(request: Request, limit: number): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new SiteHostingError(415, 'JSON is required')
  const reader = request.body?.getReader()
  if (!reader) throw new SiteHostingError(400, 'JSON is required')
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new SiteHostingError(413, 'Request exceeds the configured limit') }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new SiteHostingError(400, 'Invalid JSON') }
}

/** Open local editor storage and construct its authenticated carrier handler.
 * @param ctx - Enterprise plugin context, owning the site service.
 * @param directory - Enterprise storage directory.
 * @param publicOrigin - Configured origin used for preview links.
 * @param authorizeConnection - Store authorization owned by the enterprise deployment.
 * @param maxBodyBytes - Complete JSON body limit.
 * @param provider - Optional isolated cloud hosting provider.
 * @returns Editor handler and storage disposer; drain requests before closing.
 */
export function siteEditor(ctx: Context, directory: string, publicOrigin: string | undefined, authorizeConnection: (id: StoreConnectionId) => Promise<void>, maxBodyBytes: number, provider?: SiteHostingProvider) {
  const storage = new SqliteSiteStateStore(join(directory, 'sites.sqlite'))
  let hostingStore: SiteHostingStore | undefined
  try {
    const service = new InMemorySiteService(ctx, undefined, storage)
    hostingStore = new SiteHostingStore(join(directory, 'site-hosting.sqlite'))
    const hosting = new SiteHosting(service, hostingStore, provider)
    const tenantId = 'enterprise' as TenantId
    return {
      tools: siteTools(service, tenantId, maxBodyBytes, hosting),
      fetch: async (request: Request, route: string) => {
        const handler = createSiteHttpHandler(service, {
          authenticate: async () => tenantId,
          authorizeConnection: async (_tenant, id) => authorizeConnection(id),
          publicOrigin: publicOrigin ?? new URL(request.url).origin, maxBodyBytes,
        })
        const query = new URL(request.url).searchParams
        const siteId = query.get('siteId')
        const action = query.get('action')
        if (route === '/sites' && !siteId && request.method === 'GET') {
          return Response.json({ items: service.list(tenantId).map(site => {
            const state = hosting.get({ tenantId, siteId: site.id })
            const live = state.deployments.find(item => item.id === state.liveDeploymentId)
            return { ...site, ...(live ? { availability: state.availability ?? 'unknown' } : {}), ...(live && state.availability === 'online' ? { liveRevisionId: live.revisionId } : {}) }
          }) }, { headers: { 'cache-control': 'no-store' } })
        }
        if (route === '/sites' && siteId && action && ['hosting', 'stage', 'hosting-refresh', 'hosting-publish', 'hosting-availability', 'hosting-domain'].includes(action)) {
          const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
          const spec = { tenantId, siteId: SiteId(siteId) }
          if (!service.get(spec)) return json({ error: 'Site not found' }, 404)
          if (request.method !== (action === 'hosting' ? 'GET' : 'POST')) return json({ error: 'Method not allowed' }, 405)
          try {
            if (action === 'hosting') return json(hosting.get(spec))
            const body = await hostingBody(request, maxBodyBytes)
            if (action === 'stage') {
              const input = z.object({ revisionId: z.string().uuid() }).strict().parse(body)
              if (!service.getRevision(spec, SiteRevisionId(input.revisionId))) return json({ error: 'Revision not found' }, 404)
              return json(await hosting.stage(spec, SiteRevisionId(input.revisionId), request.signal), 202)
            }
            if (action === 'hosting-refresh') {
              z.object({}).strict().parse(body)
              return json(await hosting.refresh(spec, request.signal))
            }
            if (action === 'hosting-availability') {
              const input = z.object({ paused: z.boolean(), expectedLiveDeploymentId: deploymentSchema.shape.id, confirmed: z.literal(true) }).strict().parse(body)
              return json(await hosting.changeAvailability(spec, input, request.signal), 202)
            }
            if (action === 'hosting-domain') return json(await hosting.changeDomain(spec, siteDomainCommand.parse(body), request.signal), 202)
            const input = z.object({ deploymentId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), expectedLiveDeploymentId: z.string().uuid().nullable(), confirmed: z.literal(true) }).strict().parse(body)
            return json(await hosting.publish(spec, input, request.signal), 202)
          } catch (error) {
            if (error instanceof SiteHostingError) return json({ error: error.message }, error.status)
            if (error instanceof z.ZodError) return json({ error: 'Invalid hosting request' }, 400)
            return json({ error: 'Hosting request was not confirmed. Refresh deployment status before retrying.' }, 502)
          }
        }
        const normalized = route === '/sites' && siteId ? `/sites/${siteId}${action ? `/${action}` : ''}` : route
        return handler(request, normalized)
      },
      close: () => { hostingStore?.close(); storage.close() },
    }
  } catch (error) {
    hostingStore?.close()
    storage.close()
    throw error
  }
}
