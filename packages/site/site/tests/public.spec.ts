/** Public projection exposes only the committed revision. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { StoreConnectionId, TenantId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'

describe('public site projection', () => {
  it('returns no files before publication and excludes later drafts', async () => {
    const service = new InMemorySiteService(new Context(), async () => {})
    const site = service.createSite(TenantId('owner'), 'Store', StoreConnectionId('store'))
    const spec = { tenantId: site.tenantId, siteId: site.id }
    const first = await service.createRevision(spec, { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Published' }] }, 'user')
    expect(service.publicFiles(spec, 'https://store.test')).toEqual({})
    await service.publish(spec, first.id)
    const files = service.publicFiles(spec, 'https://store.test')
    expect(files['index.html']).toContain('Published')
    expect(files['sitemap.xml']).toContain('https://store.test/')
    const draft = await service.createRevision(spec, { baseRevisionId: first.id, pages: [{ id: 'home', kind: 'home', path: '/', title: 'Draft' }] }, 'user')
    expect(service.publicFiles(spec, 'https://store.test')['index.html']).toContain('Published')
    expect(service.preview(spec, draft.id, 'home', 'https://store.test')).toContain('Draft')
  })

  it('rejects a missing committed revision during restore validation', async () => {
    const service = new InMemorySiteService(new Context())
    const site = service.createSite(TenantId('owner'), 'Store', StoreConnectionId('store'))
    const spec = { tenantId: site.tenantId, siteId: site.id }
    const revision = await service.createRevision(spec, {}, 'user')
    expect(() =>{  service.restore({ sites: [{ ...site, publishedRevisionId: 'missing' as never }], revisions: [revision], jobs: [] }) }).toThrow('site revision reference')
  })
})
