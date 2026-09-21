/** Published discovery, optional analytics and consultation share the reviewed source version. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { SiteLocal, siteLocalConfig } from '../src/site-local.ts'
import { siteCompanyContent } from '../src/site-company-schema.ts'
import { companyTemplateProvider } from '../src/site-company-template.ts'
import { siteAgentConfig } from '../src/site-consultation.ts'
import { siteGrowth } from '../src/site-growth-schema.ts'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverableHtml } from '../src/site-discovery.ts'

const content = siteCompanyContent.parse({ name: 'Public company', description: 'Reviewed public facts', business: 'Parts', email: 'sales@example.test', phone: '', address: '', products: [], qualifications: [] })
const analytics = { scriptUrl: 'https://metrics.example.test/script.js', websiteId: '00000000-0000-4000-8000-000000000001', dashboardUrl: 'https://metrics.example.test/websites/00000000-0000-4000-8000-000000000001' }
const question = () => new Request('https://www.example.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What do you supply?' }) })

describe('website growth integrations', () => {
  it('serves canonical HTML and discovery files without exposing integration source or private dashboards', async () => {
    const ctx = new Context()
    const sites = new InMemorySiteService(ctx)
    const project = companyTemplateProvider.render(companyTemplateProvider.resolve({ content, style: 'industrial', inquiryEndpoint: 'local', growth: { analytics } }))
    const site = sites.createSiteWithProject(TenantId('enterprise'), 'Public company', project, 'user')
    const spec = { tenantId: TenantId('enterprise'), siteId: site.id }
    const local = new SiteLocal(':memory:', sites, siteLocalConfig.parse({}))
    const request = new Request('https://www.example.test/')
    try {
      const first = await local.prepare(spec, site.currentRevisionId!, 'https://www.example.test')
      local.publish(spec, { ...first, confirmed: true })
      const home = await local.fetch(spec, '/', request)
      const html = await home.text()
      expect(html).toContain(`rel="canonical" href="https://www.example.test/sites-live/${site.id}/"`)
      expect(html).toContain(`"@id":"https://www.example.test/sites-live/${site.id}/#organization"`)
      expect(html).toContain('data-website-id="00000000-0000-4000-8000-000000000001"')
      expect(html).not.toContain(analytics.dashboardUrl)
      expect(home.headers.get('content-security-policy')).toContain('https://metrics.example.test')
      expect(home.headers.get('content-security-policy')).not.toContain('allow-same-origin')
      const sitemap = await local.fetch(spec, '/sitemap.xml', request)
      expect(sitemap.headers.get('content-type')).toContain('application/xml')
      expect(await sitemap.text()).toContain(`https://www.example.test/sites-live/${site.id}/contact/`)
      expect(await (await local.fetch(spec, '/llms.txt', request)).text()).toContain('# Public company')
      expect((await local.fetch(spec, '/company.public.json', request)).status).toBe(404)
      expect((await local.fetch(spec, '/site.growth.json', request)).status).toBe(404)
      expect(local.growth(spec)).toMatchObject({ analytics, inquiries: 0, agent: false })
      const second = await local.prepare(spec, site.currentRevisionId!, 'https://other.example.test')
      expect(second.digest).not.toBe(first.digest)
      expect(await (await local.fetch(spec, '/', request)).text()).toBe(html)
      local.publish(spec, { ...second, confirmed: true })
      expect(await (await local.fetch(spec, '/', request)).text()).toContain('https://other.example.test/')
      local.offline(spec, local.state(spec).generation)
      expect((await local.fetch(spec, '/sitemap.xml', request)).status).toBe(404)
      expect(local.sitemapUrls('https://www.example.test')).toEqual([])
    } finally { local.close(); await ctx.fiber.dispose() }
  })

  it('binds consultation to published facts, enforces quotas, and removes access on offline', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-21T12:00:00Z'))
    const ctx = new Context()
    const sites = new InMemorySiteService(ctx)
    const project = companyTemplateProvider.render(companyTemplateProvider.resolve({ content, style: 'industrial', inquiryEndpoint: 'local', growth: { agent: true } }))
    const site = sites.createSiteWithProject(TenantId('enterprise'), 'Public company', project, 'user')
    const spec = { tenantId: TenantId('enterprise'), siteId: site.id }
    const seen: unknown[] = []
    const config = siteAgentConfig.parse({ provider: 'local', model: 'local', maxQuestionsPerHour: 1 })
    const local = new SiteLocal(':memory:', sites, siteLocalConfig.parse({}), { config, answer: async (facts, input) => { seen.push({ facts, input }); return 'Please describe the parts you need.' } })
    const unavailable = new SiteLocal(':memory:', sites, siteLocalConfig.parse({}))
    try {
      await expect(unavailable.prepare(spec, site.currentRevisionId!)).rejects.toThrow('Configure')
      expect((await local.fetch(spec, '/_consult', question())).status).toBe(404)
      local.publish(spec, { ...await local.prepare(spec, site.currentRevisionId!), confirmed: true })
      const invalid = new Request('https://www.example.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Hello', sessionId: 'private-session' }) })
      expect((await local.fetch(spec, '/_consult', invalid)).status).toBe(400)
      const reply = await local.fetch(spec, '/_consult', question())
      expect(reply.status).toBe(200)
      expect(await reply.json()).toEqual({ answer: 'Please describe the parts you need.' })
      expect(seen).toEqual([{ facts: content, input: { question: 'What do you supply?', history: [] } }])
      expect((await local.fetch(spec, '/_consult', question())).status).toBe(429)
      local.offline(spec, local.state(spec).generation)
      expect((await local.fetch(spec, '/_consult', question())).status).toBe(404)
    } finally { clock.mockRestore(); unavailable.close(); local.close(); await ctx.fiber.dispose() }
  })

  it('rejects credentials and query-bearing URLs before they reach page scripts or CSP', () => {
    for (const scriptUrl of ['javascript:alert(1)', 'https://user:password@example.test/script.js', 'https://example.test/script.js?token=secret', 'https://example.test/script.js#fragment']) {
      expect(siteGrowth.safeParse({ analytics: { ...analytics, scriptUrl } }).success).toBe(false)
    }
  })

  it('resolves structured URL properties without rewriting slash-prefixed business facts', () => {
    const html = discoverableHtml('<script type="application/ld+json">{"@id":"/#organization","name":"/public-name","description":"/mm is a unit","url":"/products/"}</script>', 'index.html', 'https://company.example.test/sites-live/id/', siteGrowth.parse({}))
    expect(html).toContain('"@id":"https://company.example.test/sites-live/id/#organization"')
    expect(html).toContain('"name":"/public-name"')
    expect(html).toContain('"description":"/mm is a unit"')
  })

  it('migrates published version-one bytes and persists consultation usage across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-growth-migration-'))
    const ctx = new Context()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-21T12:00:00Z'))
    let local: SiteLocal | undefined
    try {
      const sites = new InMemorySiteService(ctx)
      const project = companyTemplateProvider.render(companyTemplateProvider.resolve({ content, style: 'industrial', inquiryEndpoint: 'local', growth: { agent: true } }))
      const site = sites.createSiteWithProject(TenantId('enterprise'), 'Public company', project, 'user')
      const spec = { tenantId: TenantId('enterprise'), siteId: site.id }
      const path = join(directory, 'local.sqlite')
      const legacy = new DatabaseSync(path)
      try {
        legacy.exec('CREATE TABLE publication(site_id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE builds(site_id TEXT NOT NULL,revision_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(site_id,revision_id)); CREATE TABLE inquiries(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(site_id,request_id)); PRAGMA user_version=1')
        legacy.prepare('INSERT INTO builds VALUES(?,?,?)').run(site.id, site.currentRevisionId!, JSON.stringify({ revisionId: site.currentRevisionId, digest: 'a'.repeat(64), pages: { 'index.html': '<h1>Legacy publication</h1>' } }))
        legacy.prepare('INSERT INTO publication VALUES(?,?)').run(site.id, JSON.stringify({ revisionId: site.currentRevisionId, digest: 'a'.repeat(64), generation: 1, online: true }))
      } finally { legacy.close() }
      const consultant = { config: siteAgentConfig.parse({ provider: 'local', model: 'local', maxQuestionsPerHour: 1 }), answer: async () => { throw new Error('Provider unavailable') } }
      local = new SiteLocal(path, sites, siteLocalConfig.parse({}), consultant)
      expect(await (await local.fetch(spec, '/', new Request('http://localhost/'))).text()).toBe('<h1>Legacy publication</h1>')
      local.publish(spec, { ...await local.prepare(spec, site.currentRevisionId!), confirmed: true })
      expect((await local.fetch(spec, '/_consult', question())).status).toBe(503)
      local.close(); local = undefined
      local = new SiteLocal(path, sites, siteLocalConfig.parse({}), consultant)
      expect((await local.fetch(spec, '/_consult', question())).status).toBe(429)
      expect(local.state(spec).generation).toBe(2)
    } finally { clock.mockRestore(); local?.close(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) }
  })
})
