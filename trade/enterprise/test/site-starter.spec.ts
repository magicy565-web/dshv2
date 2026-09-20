/** Manufacturing starters retain editable source and reject oversized projects before creating a site. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { renderStaticPreview } from '../../../packages/site/site/src/preview.ts'
import { createTemplateSite } from '../src/site-starter.ts'
import { SiteTemplateService } from '../../../packages/site/site/src/templates.ts'
import { manufacturingProvider, manufacturingTemplateId, manufacturingTemplateVersion } from '../src/site-template-provider.ts'
const selection = { id: manufacturingTemplateId, version: manufacturingTemplateVersion, parameters: {} }

describe('manufacturing starter', () => {
  it('saves all ten pages and local images as an editable draft without publication', async () => {
    const ctx = new Context()
    try {
      const service = new InMemorySiteService(ctx)
      const templates = new SiteTemplateService(ctx)
      ctx.effect(() => templates.register(manufacturingProvider))
      const tenantId = TenantId('manufacturer')
      const site = await createTemplateSite(service, tenantId, 'Manufacturing', 1048576, 'user', templates, selection)
      const spec = { tenantId, siteId: site.id }
      expect(service.get(spec)?.currentRevisionId).toBe(site.currentRevisionId)
      const content = service.content(spec, site.currentRevisionId!)
      expect(content.project?.files.filter(file => file.path.endsWith('.html'))).toHaveLength(10)
      expect(content.project?.files.filter(file => file.encoding === 'base64')).toHaveLength(2)
      expect(service.listPublishJobs(spec)).toEqual([])
      expect(service.listRevisions(spec)[0]?.source).toBe('user')
      const build = service.build(spec, site.currentRevisionId!)
      for (const file of content.project!.files.filter(file => file.path.endsWith('.html'))) {
        const preview = await renderStaticPreview(build, `/${file.path}`, path => `/preview?path=${encodeURIComponent(path)}`, 1048576)
        expect(await preview.text()).toContain('Northline')
      }
    } finally { await ctx.fiber.dispose() }
  })

  it('enforces the complete revision request limit before persisting a site', async () => {
    const ctx = new Context()
    try {
      const service = new InMemorySiteService(ctx)
      const templates = new SiteTemplateService(ctx)
      ctx.effect(() => templates.register(manufacturingProvider))
      const tenantId = TenantId('manufacturer')
      const bytes = Buffer.byteLength(JSON.stringify({ changeSet: { project: templates.generate(selection) } }))
      expect(() => createTemplateSite(service, tenantId, 'Too large', bytes - 1, 'agent', templates, selection)).toThrow('exceeds the configured')
      expect(service.list(tenantId)).toEqual([])
      const site = await createTemplateSite(service, tenantId, 'Fits', bytes, 'agent', templates, selection)
      expect(site.currentRevisionId).toBeDefined()
    } finally { await ctx.fiber.dispose() }
  })

  it('escapes custom company and product text, rebuilds product routes and rejects duplicate slugs', async () => {
    const ctx = new Context()
    try {
      const templates = new SiteTemplateService(ctx)
      ctx.effect(() => templates.register(manufacturingProvider))
      const product = { slug: 'custom-part', title: '<img src=x onerror=alert(1)>', type: 'Custom & OEM', image: 'housing', category: 'machining', summary: 'A < B', detail: 'Drawing R1', options: ['Material & finish'] }
      const project = templates.generate({ ...selection, parameters: { brandName: '<script>alert(1)</script>', style: 'international', products: [product] } })
      expect(project.files.filter(file => file.path.endsWith('.html'))).toHaveLength(8)
      expect(project.files.find(file => file.path === 'products/custom-part/index.html')?.content).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(project.files.find(file => file.path === 'contact/index.html')?.content).toContain('data-product-slug="custom-part"')
      for (const file of project.files.filter(file => file.path.endsWith('.html'))) {
        expect(file.content).not.toContain('<script>alert(1)</script>')
        expect(file.content).not.toContain('/products/shaft-couplings/')
      }
      expect(() => templates.generate({ ...selection, parameters: { products: [product, product] } })).toThrow('unique')
      expect(() => templates.generate({ ...selection, parameters: { style: 'unsupported' } })).toThrow()
    } finally { await ctx.fiber.dispose() }
  })
})
