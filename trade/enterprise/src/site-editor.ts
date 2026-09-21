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
import { siteCompanyContent, siteCompanyReview } from './site-company-schema.ts'
import { suggestCompanyPages } from './site-company-pages.ts'
import { SiteLocal, siteLocalConfig, localPublishCommand, localOfflineCommand, inquiryCommand, readSiteJson } from './site-local.ts'
import { siteGrowth } from './site-growth-schema.ts'
import { translateSiteContent, siteConsultation, type SiteAgentConfig } from './site-consultation.ts'
import { SiteOperations } from './site-operations.ts'
import { siteServicesConfig, type SiteServicesConfig } from './site-services.ts'

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
 * @param agentConfig - Optional explicit model route for public consultations.
 * @param operations - Self-hosted service configuration and the existing enterprise task consumer.
 * @returns Editor handler and storage disposer; drain requests before closing.
 */
export function siteEditor(ctx: Context, directory: string, publicOrigin: string | undefined, authorizeConnection: (id: StoreConnectionId) => Promise<void>, maxBodyBytes: number, provider?: SiteHostingProvider, companyReview?: () => z.infer<typeof siteCompanyReview>, localLimits?: z.input<typeof siteLocalConfig>, agentConfig?: SiteAgentConfig, operations?: { services: SiteServicesConfig; followup?: (inquiry: { id: string; name: string; email: string; company: string; message: string }, input: { assignee: string; dueDate: string | null }) => unknown }) {
  const storage = new SqliteSiteStateStore(join(directory, 'sites.sqlite'))
  let hostingStore: SiteHostingStore | undefined
  let unregisterTemplate: (() => void) | undefined
  let unregisterCompany: (() => void) | undefined
  let localStore: SiteLocal | undefined
  let operationStore: SiteOperations | undefined
  try {
    const service = new InMemorySiteService(ctx, undefined, storage)
    const templates = new SiteTemplateService(ctx)
    unregisterTemplate = templates.register(manufacturingProvider)
    unregisterCompany = templates.register(companyTemplateProvider)
    const local = new SiteLocal(join(directory, 'site-local.sqlite'), service, siteLocalConfig.parse(localLimits ?? {}), agentConfig ? { answer: siteConsultation(ctx, agentConfig), config: agentConfig } : undefined)
    localStore = local
    const operator = new SiteOperations(join(directory, 'site-operations.sqlite'), service, local, operations?.services ?? siteServicesConfig.parse({}))
    operationStore = operator
    hostingStore = new SiteHostingStore(join(directory, 'site-hosting.sqlite'))
    const hosting = new SiteHosting(service, hostingStore, provider)
    const tenantId = 'enterprise' as TenantId
    return {
      tick: (signal: AbortSignal) => operator.tick(service.list(tenantId).map(site => ({ tenantId, siteId: site.id })), signal),
      sitemapUrls: (origin: string) => local.sitemapUrls(publicOrigin ?? origin),
      tools: siteTools(service, tenantId, maxBodyBytes, hosting, templates),
      publicFetch: async (request: Request) => {
        const match = new URL(request.url).pathname.match(/^\/sites-live\/([^/]+)(\/.*)?$/)
        if (!match || !z.string().uuid().safeParse(match[1]).success) return new Response('Not found', { status: 404 })
        if (!match[2]) return Response.redirect(new URL(`/sites-live/${match[1]}/`, request.url), 308)
        const spec = { tenantId, siteId: SiteId(match[1]!) }
        const response = await local.fetch(spec, decodeURIComponent(match[2]), request)
        if (request.method === 'GET' && response.status === 200) operator.recordCrawler(spec, request.headers.get('user-agent') ?? '')
        return response
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
        if (route === '/sites' && siteId && action?.startsWith('ops-')) {
          const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
          try {
            const spec = { tenantId, siteId: SiteId(z.string().uuid().parse(siteId)) }
            const site = service.get(spec)
            if (!site) throw new SiteHostingError(404, 'Site not found')
            if (request.method !== (['ops-report', 'ops-content'].includes(action) ? 'GET' : 'POST')) return json({ error: 'Method not allowed' }, 405)
            if (action === 'ops-report') {
              const report = await operator.report(spec, z.coerce.number().int().min(1).max(90).parse(query.get('days') ?? 30), request.signal)
              const published = local.state(spec).revisionId
              const target = published ?? site.currentRevisionId
              const project = target ? service.content(spec, SiteRevisionId(target)).project : undefined
              const receiptFile = project?.files.find(file => file.path === 'site.template.json')
              const sourceDigest = receiptFile ? templates.inspect(project!).receipt.parameters.sourceDigest : undefined
              return json({ ...report, sourceChanged: Boolean(sourceDigest && companyReview && sourceDigest !== companyReview().digest) })
            }
            const project = site.currentRevisionId ? service.content(spec, site.currentRevisionId).project : undefined
            if (action === 'ops-content') {
              if (!project) throw new SiteHostingError(409, 'No saved project')
              if (!project.files.some(file => file.path === 'site.template.json')) return json({ revisionId: site.currentRevisionId, sourceEdited: true, parameters: null, agentAvailable: Boolean(agentConfig), sourceChanged: false, review: null })
              const current = templates.inspect(project)
              const fresh = companyReview?.()
              return json({ revisionId: site.currentRevisionId, sourceEdited: current.sourceEdited || current.receipt.id !== companyTemplateId, parameters: current.receipt.parameters, agentAvailable: Boolean(agentConfig), sourceChanged: fresh?.digest !== current.receipt.parameters.sourceDigest, review: fresh ?? null })
            }
            const body = await hostingBody(request, maxBodyBytes)
            if (action === 'ops-configure') { const input = z.object({ expectedVersion: z.number().int().nonnegative(), settings: z.unknown() }).strict().parse(body); return json(operator.configure(spec, input.expectedVersion, input.settings)) }
            if (action === 'ops-monitor') { await operator.monitor(spec, request.signal); return json({ checked: true }) }
            if (action === 'ops-delete-observation') { const input = z.object({ id: z.number().int().positive() }).strict().parse(body); operator.deleteObservation(spec, input.id); return json({ deleted: true }) }
            if (action === 'ops-citation') { operator.citation(spec, body); return json({ recorded: true }) }
            if (action === 'ops-followup') {
              const input = z.object({ id: z.string().uuid(), assignee: z.string().max(160), dueDate: z.iso.date().nullable() }).strict().parse(body)
              if (!operations?.followup) throw new SiteHostingError(503, 'Enterprise tasks unavailable')
              return json(await operations.followup(local.inquiry(spec, input.id), input))
            }
            if (action === 'ops-retry') { const input = z.object({ id: z.string().uuid(), channel: z.enum(['notifications', 'crm']), confirmed: z.literal(true) }).strict().parse(body); await operator.retryDelivery(spec, input.id, input.channel, request.signal); return json({ checked: true }) }
            if (action === 'ops-reconcile') { const input = z.object({ id: z.string().uuid() }).strict().parse(body); await operator.deliver(spec, input.id, 'crm', request.signal, true); return json({ checked: true }) }
            if (action === 'ops-evaluate') {
              const input = z.object({ question: z.string().trim().min(1).max(2000) }).strict().parse(body)
              const started = Date.now()
              const response = await local.fetch(spec, '/_consult', new Request(new URL(`/sites-live/${siteId}/_consult`, publicOrigin ?? request.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: request.signal }))
              const result = await response.json() as unknown
              operator.record(spec, 'model', { question: input.question, result, status: response.status, durationMs: Date.now() - started, source: 'configured-website-model' })
              return json(result, response.status)
            }
            if (action === 'ops-translate') {
              if (!agentConfig) throw new SiteHostingError(503, 'Configure the website model first')
              const input = z.object({ content: siteCompanyContent, locale: z.enum(['en', 'zh-CN']) }).strict().parse(body)
              return json(await translateSiteContent(ctx, agentConfig, input.content, input.locale, request.signal))
            }
            if (action === 'ops-draft') {
              const input = z.object({ revisionId: z.string().uuid(), parameters: z.record(z.string(), z.unknown()), sourceDigest: z.string().optional(), refreshSource: z.boolean(), autoAnalytics: z.boolean(), confirmed: z.literal(true) }).strict().parse(body)
              if (!project || site.currentRevisionId !== input.revisionId) throw new SiteHostingError(409, 'Draft changed; refresh before saving')
              const inspected = templates.inspect(project)
              if (inspected.sourceEdited || inspected.receipt.id !== companyTemplateId) throw new SiteHostingError(409, 'This source has manual edits; export it or create a separate template website')
              const parameters = { ...input.parameters }
              if (input.refreshSource) { const current = companyReview?.(); if (!current?.content || current.digest !== input.sourceDigest) throw new SiteHostingError(409, 'Company records changed; review again'); parameters.content = { ...current.content, pages: siteCompanyContent.parse(parameters.content).pages }; parameters.translations = []; parameters.sourceDigest = current.digest }
              const growth = siteGrowth.parse(parameters.growth ?? {})
              if (growth.agent && !agentConfig) throw new SiteHostingError(422, 'Configure the website model first')
              if (input.autoAnalytics) growth.analytics = await operator.provision(spec, new URL(`/sites-live/${siteId}/`, publicOrigin ?? request.url).href, request.signal)
              parameters.growth = growth
              const next = templates.generate({ id: companyTemplateId, version: companyTemplateVersion, parameters: parameters as import('../../../packages/site/site/src/template-types.ts').SiteTemplateParameters })
              if (Buffer.byteLength(JSON.stringify(next)) > maxBodyBytes) throw new SiteHostingError(413, 'Source exceeds configured limit')
              return json(await service.createRevision(spec, { baseRevisionId: SiteRevisionId(input.revisionId), project: next }, 'user'), 201)
            }
            return json({ error: 'Unknown website operation' }, 400)
          } catch (error) { return json({ error: error instanceof SiteHostingError ? error.message : 'Website operation failed' }, error instanceof SiteHostingError ? error.status : error instanceof z.ZodError ? 400 : 502) }
        }
        if (route === '/sites' && action && ['company-source', 'company-create', 'local', 'local-review', 'local-publish', 'local-offline', 'inbox', 'inquiry', 'growth'].includes(action)) {
          const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
          if (request.method !== (['company-source', 'local', 'local-review', 'inbox', 'growth'].includes(action) ? 'GET' : 'POST')) return json({ error: 'Method not allowed' }, 405)
          try {
            if (action === 'company-source' || action === 'company-create') {
              if (!companyReview) throw new SiteHostingError(503, 'Company records unavailable')
              const review = companyReview()
              if (action === 'company-source') return json({ ...review, agentAvailable: Boolean(agentConfig) })
              const input = z.object({ digest: z.string(), style: z.enum(['industrial', 'precision', 'international']), confirmed: z.literal(true), growth: siteGrowth.prefault({}) }).strict().parse(await hostingBody(request, maxBodyBytes))
              if (input.growth.agent && !agentConfig) throw new SiteHostingError(422, 'Configure a local model for the website Agent first')
              const current = companyReview()
              if (input.digest !== current.digest) throw new SiteHostingError(409, 'Company content changed; review it again')
              if (!current.content) throw new SiteHostingError(422, 'Submit a company profile with a description first')
              return json(createTemplateSite(service, tenantId, current.content.name, maxBodyBytes, 'user', templates, { id: companyTemplateId, version: companyTemplateVersion, parameters: { content: suggestCompanyPages(current.content, 'en'), style: input.style, inquiryEndpoint: 'local', growth: input.growth, sourceDigest: current.digest } }), 201)
            }
            const spec = { tenantId, siteId: SiteId(z.string().uuid().parse(siteId)) }
            if (action === 'local') return json(local.state(spec))
            if (action === 'growth') return json(local.growth(spec))
            if (action === 'local-review') return json(await local.prepare(spec, SiteRevisionId(z.string().uuid().parse(query.get('revisionId'))), publicOrigin ?? new URL(request.url).origin))
            if (action === 'inbox') return json(local.inbox(spec))
            const body = await hostingBody(request, maxBodyBytes)
            if (action === 'local-publish') return json(local.publish(spec, localPublishCommand.parse(body)))
            if (action === 'local-offline') return json(local.offline(spec, localOfflineCommand.parse(body).expectedGeneration))
            const command = inquiryCommand.parse(body)
            const result = local.updateInquiry(spec, command)
            if (command.action === 'delete') operator.deleteInquiry(spec, command.id)
            return json(result)
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
      close: () => { unregisterCompany?.(); unregisterTemplate?.(); operationStore?.close(); localStore?.close(); hostingStore?.close(); storage.close() },
    }
  } catch (error) {
    unregisterTemplate?.()
    unregisterCompany?.()
    localStore?.close()
    operationStore?.close()
    hostingStore?.close()
    storage.close()
    throw error
  }
}
