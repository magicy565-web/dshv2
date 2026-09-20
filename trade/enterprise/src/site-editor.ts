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
import { createTemplateSite } from './site-starter.ts'
import { SiteTemplateService, SiteTemplateError } from '../../../packages/site/site/src/templates.ts'
import { manufacturingProvider } from './site-template-provider.ts'
import { siteTemplateInput, siteTemplateSelection } from './site-template-input.ts'
import { companyTemplateProvider, companyTemplateId, companyTemplateVersion } from './site-company-template.ts'
import { siteCompanyReview } from './site-company-schema.ts'
import { SiteLocal, siteLocalConfig, localPublishCommand, localOfflineCommand, inquiryCommand, readSiteJson } from './site-local.ts'

const hostingBody = readSiteJson

/** Open local editor storage and construct its authenticated carrier handler.
 * @param ctx - Enterprise plugin context, owning the site service.
 * @param directory - Enterprise storage directory.
 * @param publicOrigin - Configured origin used for preview links.
 * @param authorizeConnection - Store authorization owned by the enterprise deployment.
 * @param maxBodyBytes - Complete JSON body limit.
 * @param provider - Optional isolated cloud hosting provider.
 * @param companyReview - Deployment-owned projection of submitted company facts.
 * @param localLimits - Optional local publication quotas, resolved at this entry point.
 * @returns Editor handler and storage disposer; drain requests before closing.
 */
export function siteEditor(ctx: Context, directory: string, publicOrigin: string | undefined, authorizeConnection: (id: StoreConnectionId) => Promise<void>, maxBodyBytes: number, provider?: SiteHostingProvider, companyReview?: () => z.infer<typeof siteCompanyReview>, localLimits?: z.input<typeof siteLocalConfig>) {
  const storage = new SqliteSiteStateStore(join(directory, 'sites.sqlite'))
  let hostingStore: SiteHostingStore | undefined
  let unregisterTemplate: (() => void) | undefined
  let unregisterCompany: (() => void) | undefined
  let localStore: SiteLocal | undefined
  try {
    const service = new InMemorySiteService(ctx, undefined, storage)
    const templates = new SiteTemplateService(ctx)
    unregisterTemplate = templates.register(manufacturingProvider)
    unregisterCompany = templates.register(companyTemplateProvider)
    const local = new SiteLocal(join(directory, 'site-local.sqlite'), service, siteLocalConfig.parse(localLimits ?? {}))
    localStore = local
    hostingStore = new SiteHostingStore(join(directory, 'site-hosting.sqlite'))
    const hosting = new SiteHosting(service, hostingStore, provider)
    const tenantId = 'enterprise' as TenantId
    return {
      tools: siteTools(service, tenantId, maxBodyBytes, hosting, templates),
      publicFetch: async (request: Request) => {
        const match = new URL(request.url).pathname.match(/^\/sites-live\/([^/]+)(\/.*)?$/)
        if (!match || !z.string().uuid().safeParse(match[1]).success) return new Response('Not found', { status: 404 })
        if (!match[2]) return Response.redirect(new URL(`/sites-live/${match[1]}/`, request.url), 308)
        return local.fetch({ tenantId, siteId: SiteId(match[1]!) }, decodeURIComponent(match[2]), request)
      },
      fetch: async (request: Request, route: string) => {
        const handler = createSiteHttpHandler(service, {
          authenticate: async () => tenantId,
          authorizeConnection: async (_tenant, id) => authorizeConnection(id),
          publicOrigin: publicOrigin ?? new URL(request.url).origin, maxBodyBytes,
        })
        const query = new URL(request.url).searchParams
        const siteId = query.get('siteId')
        const action = query.get('action')
        if (route === '/sites' && action && ['company-source', 'company-create', 'local', 'local-review', 'local-publish', 'local-offline', 'inbox', 'inquiry'].includes(action)) {
          const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
          if (request.method !== (['company-source', 'local', 'local-review', 'inbox'].includes(action) ? 'GET' : 'POST')) return json({ error: 'Method not allowed' }, 405)
          try {
            if (action === 'company-source' || action === 'company-create') {
              if (!companyReview) throw new SiteHostingError(503, 'Company records unavailable')
              const review = companyReview()
              if (action === 'company-source') return json(review)
              const input = z.object({ digest: z.string(), style: z.enum(['industrial', 'precision', 'international']), confirmed: z.literal(true) }).strict().parse(await hostingBody(request, maxBodyBytes))
              const current = companyReview()
              if (input.digest !== current.digest) throw new SiteHostingError(409, 'Company content changed; review it again')
              if (!current.content) throw new SiteHostingError(422, 'Submit a company profile with a description first')
              return json(createTemplateSite(service, tenantId, current.content.name, maxBodyBytes, 'user', templates, { id: companyTemplateId, version: companyTemplateVersion, parameters: { content: current.content, style: input.style, inquiryEndpoint: 'local' } }), 201)
            }
            const spec = { tenantId, siteId: SiteId(z.string().uuid().parse(siteId)) }
            if (action === 'local') return json(local.state(spec))
            if (action === 'local-review') return json(await local.prepare(spec, SiteRevisionId(z.string().uuid().parse(query.get('revisionId')))))
            if (action === 'inbox') return json(local.inbox(spec))
            const body = await hostingBody(request, maxBodyBytes)
            if (action === 'local-publish') return json(local.publish(spec, localPublishCommand.parse(body)))
            if (action === 'local-offline') return json(local.offline(spec, localOfflineCommand.parse(body).expectedGeneration))
            return json(local.updateInquiry(spec, inquiryCommand.parse(body)))
          } catch (error) {
            return json({ error: error instanceof SiteHostingError ? error.message : 'Site operation failed' }, error instanceof SiteHostingError ? error.status : error instanceof z.ZodError ? 400 : 500)
          }
        }
        if (route === '/sites' && !siteId && action === 'templates') {
          return Response.json({ items: templates.list() }, { status: request.method === 'GET' ? 200 : 405, headers: { 'cache-control': 'no-store' } })
        }
        if (route === '/sites' && !siteId && action === 'starter') {
          const json = (value: unknown, status: number) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
          try {
            const input = z.object({ name: z.string().trim().min(1).max(160), template: siteTemplateInput }).strict().parse(await hostingBody(request, maxBodyBytes))
            request.signal.throwIfAborted()
            return json(createTemplateSite(service, tenantId, input.name, maxBodyBytes, 'user', templates, siteTemplateSelection(input.template)), 201)
          } catch (error) {
            if (error instanceof SiteHostingError) return json({ error: error.message }, error.status)
            if (error instanceof z.ZodError) return json({ error: 'Invalid starter request' }, 400)
            if (error instanceof SiteTemplateError) return json({ error: error.message }, 400)
            return json({ error: 'Starter creation failed. Refresh the site list before retrying.' }, 500)
          }
        }
        if (route === '/sites' && !siteId && request.method === 'GET') {
          return Response.json({ maxBodyBytes, items: service.list(tenantId).map(site => {
            const state = hosting.get({ tenantId, siteId: site.id })
            const live = state.deployments.find(item => item.id === state.liveDeploymentId)
            const own = local.state({ tenantId, siteId: site.id })
            return { ...site, ...(own.online ? { availability: 'online', liveRevisionId: own.revisionId } : live ? { availability: state.availability ?? 'unknown' } : own.revisionId ? { availability: 'offline' } : {}), ...(!own.online && live && state.availability === 'online' ? { liveRevisionId: live.revisionId } : {}) }
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
      close: () => { unregisterCompany?.(); unregisterTemplate?.(); localStore?.close(); hostingStore?.close(); storage.close() },
    }
  } catch (error) {
    unregisterTemplate?.()
    unregisterCompany?.()
    localStore?.close()
    hostingStore?.close()
    storage.close()
    throw error
  }
}
