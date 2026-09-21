/** Self-hosted integration protocols, durable claims and cross-site access use isolated resources. */
import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { SiteOperations } from '../src/site-operations.ts'
import { siteServices, siteServicesConfig } from '../src/site-services.ts'
import { SiteLocal, siteLocalConfig } from '../src/site-local.ts'
import { siteCompanyContent } from '../src/site-company-schema.ts'
import { companyTemplateProvider } from '../src/site-company-template.ts'
import { siteEditor } from '../src/site-editor.ts'
import { installSiteSystem } from './site-system-fixture.ts'

const content = siteCompanyContent.parse({ name: 'Public firm', description: 'Public facts', business: '', email: '', phone: '', address: '', products: [], qualifications: [] })
const signal = () => new AbortController().signal

it('provisions once, reports upstream metrics, preserves unknown delivery across restart and separates GEO evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'site-operations-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  const websites = new Map<string, unknown>(); let creates = 0; let leadCreates = 0; let notices = 0; let searchCount = 0; let metricsFail = false; let noticeFailure = false
  const leads: { id: string }[] = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost'); let body = ''; for await (const chunk of request) body += String(chunk)
    const send = (value: unknown, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (url.pathname.startsWith('/api/websites')) {
      if (request.headers.authorization !== 'Bearer private-umami') return send({}, 401)
      if (request.method === 'POST') { const value = JSON.parse(body) as { id: string }; websites.set(value.id, value); creates++; return send(value) }
      if (url.pathname.endsWith('/stats')) return send({ pageviews: { value: 25 }, visitors: 4, visits: 6 }, metricsFail ? 503 : 200)
      if (url.pathname.endsWith('/metrics')) return send([{ x: url.searchParams.get('type') === 'event' ? 'inquiry_received' : 'search.example', y: 2 }])
      const found = websites.get(url.pathname.split('/').at(-1)!); return send(found ?? {}, found ? 200 : 404)
    }
    if (url.pathname === '/search') { searchCount++; return send({ results: [{ title: 'Our page', url: url.searchParams.get('q') }], unresponsive_engines: [['engine', 'timeout']] }) }
    if (url.pathname === '/api/v1/Lead') {
      if (request.headers['x-api-key'] !== 'private-crm') return send({}, 401)
      if (request.method === 'GET') return send({ list: leads })
      leadCreates++; leads.push({ id: 'lead-1' }); return send({}, 503)
    }
    if (request.headers.authorization !== 'Bearer private-ntfy') return send({}, 401)
    expect(body).not.toContain('buyer@example.test'); notices++; return send({ id: 'notification-1' }, noticeFailure ? 503 : 200)
  })
  t.onTestFinished(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address')
  const baseUrl = `http://127.0.0.1:${address.port}/`
  const config = siteServicesConfig.parse({ umami: { baseUrl, publicUrl: baseUrl, apiKey: 'private-umami' }, search: { baseUrl }, notifications: { baseUrl, topic: 'inquiries', token: 'private-ntfy' }, crm: { baseUrl, apiKey: 'private-crm' } })
  const ctx = new Context(); t.onTestFinished(() => ctx.fiber.dispose())
  const sites = new InMemorySiteService(ctx); const tenantId = TenantId('enterprise')
  const project = companyTemplateProvider.render(companyTemplateProvider.resolve({ content, style: 'industrial', inquiryEndpoint: 'local' }))
  const site = sites.createSiteWithProject(tenantId, 'Company', project, 'user'); const spec = { tenantId, siteId: site.id }
  const other = sites.createSiteWithProject(tenantId, 'Other', project, 'user'); const otherSpec = { tenantId, siteId: other.id }
  const local = new SiteLocal(':memory:', sites, siteLocalConfig.parse({})); t.onTestFinished(() => local.close())
  local.publish(spec, { ...await local.prepare(spec, site.currentRevisionId!, 'https://company.example'), confirmed: true })
  let operations = new SiteOperations(join(root, 'operations.sqlite'), sites, local, config); t.onTestFinished(() => operations.close())
  const publicUrl = local.growth(spec).publicUrl!
  expect(await operations.provision(spec, publicUrl, signal())).toMatchObject({ websiteId: site.id })
  await operations.provision(spec, publicUrl, signal()); expect(creates).toBe(1)
  await expect(operations.provision(spec, 'https://another.example/', signal())).rejects.toThrow('domain differs')
  const received = await local.fetch(spec, '/_inquiries', new Request(publicUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: 'a'.repeat(32), name: 'Buyer', email: 'buyer@example.test', company: 'Buyer Ltd', product: '', message: 'Please send more information', consent: true, website: '' }) }))
  expect(received.status).toBe(201); const { id } = await received.json() as { id: string }
  const settings = { notifications: true, crm: true, monitor: { enabled: true, queries: [publicUrl], intervalHours: 24 } }
  operations.configure(spec, 0, settings)
  expect(() => operations.configure(spec, 0, { ...settings, crm: false })).toThrow('Settings changed')
  expect(operations.settings(spec).settings.crm).toBe(true)
  await Promise.all([operations.tick([spec], signal()), operations.tick([spec], signal())])
  expect({ notices, leadCreates, searchCount }).toEqual({ notices: 1, leadCreates: 1, searchCount: 1 })
  operations.recordCrawler(spec, 'Unverified GPTBot/1.0')
  operations.citation(spec, { engine: 'Public AI', question: 'Who supplies parts?', answer: 'A recorded answer', evidenceUrl: 'https://evidence.example/share?id=1', citedUrls: [publicUrl, 'https://another.example/'], observedAt: new Date(Date.now() - 1000).toISOString() })
  let report = await operations.report(spec, 30, signal())
  expect(report.observations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'search', data: expect.objectContaining({ status: 'partial', matches: [expect.objectContaining({ position: 1 })] }) }), expect.objectContaining({ kind: 'citation', data: expect.objectContaining({ source: 'manual', citedPages: [publicUrl] }) })]))
  expect(report.crawlers).toHaveLength(1); expect(report.deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ channel: 'crm', state: 'unknown' }), expect.objectContaining({ channel: 'notifications', state: 'delivered', reference: 'notification-1' })]))
  expect(JSON.stringify(report)).not.toMatch(/private-umami|private-crm|private-ntfy|buyer@example/)
  await expect(operations.deliver(otherSpec, id, 'crm', signal())).rejects.toThrow()
  operations.close(); operations = new SiteOperations(join(root, 'operations.sqlite'), sites, local, config)
  await operations.tick([spec], signal()); expect(leadCreates).toBe(1)
  await operations.deliver(spec, id, 'crm', signal(), true)
  report = await operations.report(spec, 30, signal()); expect(report.deliveries).toContainEqual(expect.objectContaining({ channel: 'crm', state: 'delivered', reference: 'lead-1' }))
  expect((await operations.report(otherSpec, 30, signal())).observations).toEqual([])
  operations.deleteObservation(spec, report.observations[0]!.id); expect((await operations.report(spec, 30, signal())).observations).toHaveLength(1)
  const another = await local.fetch(spec, '/_inquiries', new Request(publicUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: 'b'.repeat(32), name: 'Buyer', email: 'buyer@example.test', company: '', product: '', message: 'Another reviewed inquiry', consent: true, website: '' }) }))
  const anotherId = (await another.json() as { id: string }).id
  noticeFailure = true
  await operations.deliver(spec, anotherId, 'notifications', signal())
  expect((await operations.report(spec, 30, signal())).deliveries).toContainEqual(expect.objectContaining({ inquiryId: anotherId, state: 'unknown' }))
  noticeFailure = false
  const retries = await Promise.allSettled([operations.retryDelivery(spec, anotherId, 'notifications', signal()), operations.retryDelivery(spec, anotherId, 'notifications', signal())])
  expect(retries.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(notices).toBe(3)
  expect((await operations.report(spec, 30, signal())).inquiries).toBe(2)
  const api = siteServices(config)
  expect(await api.analytics(site.id, 0, Date.now(), signal())).toMatchObject({ pageviews: 25, visitors: 4, visits: 6 })
  metricsFail = true; await expect(api.analytics(site.id, 0, Date.now(), signal())).rejects.toThrow('503')
})

it('updates reviewed configuration with optimistic revisions and refuses stale facts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'site-setup-')); t.onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  const ctx = new Context(); t.onTestFinished(() => ctx.fiber.dispose())
  let digest = 'a'.repeat(64)
  installSiteSystem(ctx)
  const editor = siteEditor(ctx, root, 'https://company.example', async () => {}, 16777216, undefined, () => ({ digest, content, issues: [], inquiryEndpoint: 'local' }))
  t.onTestFinished(() => editor.close())
  const call = (action: string, siteId?: string, body?: unknown) => editor.fetch(new Request(`https://company.example/sites?${new URLSearchParams({ action, ...(siteId ? { siteId } : {}) })}`, { method: body ? 'POST' : 'GET', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }), '/sites')
  const creation = await call('company-create', undefined, { digest, style: 'industrial', confirmed: true }); expect(creation.status).toBe(201)
  const site = await creation.json() as { id: string }
  const source = await (await call('ops-content', site.id)).json() as { revisionId: string; parameters: Record<string, unknown> }
  const next = { revisionId: source.revisionId, parameters: { ...source.parameters, content: { ...content, pages: [{ kind: 'case', slug: 'reviewed-case', title: 'Published case', summary: 'Public case', sections: [{ title: 'Result', body: 'Only reviewed facts' }], sources: [] }] } }, autoAnalytics: false, refreshSource: true, sourceDigest: digest, confirmed: true }
  digest = 'b'.repeat(64)
  expect((await call('ops-draft', site.id, next)).status).toBe(409)
  const updated = await call('ops-draft', site.id, { ...next, sourceDigest: digest }); expect(updated.status).toBe(201)
  expect(await updated.json()).toHaveProperty('id')
  const saved = await (await call('ops-content', site.id)).json() as { parameters: { content: { pages: unknown[] }; sourceDigest: string } }
  expect(saved.parameters.content.pages).toHaveLength(1); expect(saved.parameters.sourceDigest).toBe(digest)
  expect((await call('ops-draft', site.id, { ...next, sourceDigest: digest })).status).toBe(409)
  expect(await (await call('local', site.id)).json()).toMatchObject({ online: false })
})

it('keeps language paths and structured references distinct without translating facts at render time', () => {
  const pages = [{ kind: 'case', slug: 'proof', title: '真实案例', summary: '公开摘要', sections: [{ title: '结果', body: '经审核的案例正文' }], sources: [{ title: '公开证据', url: 'https://company.example/evidence' }] }]
  const project = companyTemplateProvider.render(companyTemplateProvider.resolve({ content: { ...content, pages }, style: 'precision', inquiryEndpoint: 'local', locale: 'zh-CN', translations: [{ locale: 'en', content: { ...content, pages: [{ ...pages[0], title: 'Reviewed case', summary: 'Public summary' }] } }] }))
  const chinese = project.files.find(file => file.path === 'resources/case/proof/index.html')!.content
  const english = project.files.find(file => file.path === 'en/resources/case/proof/index.html')!.content
  expect(chinese).toContain('真实案例'); expect(chinese).toContain('hreflang="en" href="/en/resources/case/proof/"')
  expect(english).toContain('href="/en/contact/"'); expect(english).toContain('"@id":"/en/#organization"')
  expect(english).toContain('https://company.example/evidence'); expect(english).not.toContain('${t(')
  expect(() => companyTemplateProvider.resolve({ content, style: 'industrial', inquiryEndpoint: 'local', locale: 'en', translations: [{ locale: 'en', content }] })).toThrow('Duplicate')
})
