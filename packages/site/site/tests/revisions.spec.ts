/** Partial edits and historical previews resolve from immutable revision ancestry. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TenantId, StoreConnectionId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'

describe('site revision review', () => {
  it('retains pages across theme-only edits and previews the selected historical content', async () => {
    const service = new InMemorySiteService(new Context())
    const site = service.createSite(TenantId('owner'), 'Store', StoreConnectionId('store'))
    const spec = { tenantId: site.tenantId, siteId: site.id }
    const first = await service.createRevision(spec, { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Original' }] }, 'user')
    const theme = { colors: { primary: '#112233' }, fonts: {}, layout: {} }
    const second = await service.createRevision(spec, { theme }, 'agent')
    expect(second.changeSet.baseRevisionId).toBe(first.id)
    expect(service.content(spec, second.id)).toMatchObject({ pages: first.changeSet.pages, theme })
    expect(service.diff(spec, second.id, first.id)).toMatchObject({ added: [], removed: [], changed: [], themeChanged: true, pageOrderChanged: false })
    expect(service.preview(spec, second.id, 'home', 'https://example.test')).toContain('<h1>Original</h1>')
    const third = await service.createRevision(spec, { pages: [] }, 'user')
    expect(service.diff(spec, third.id, second.id).removed).toEqual(first.changeSet.pages)
    expect(() => service.preview(spec, third.id, 'home', 'https://example.test')).toThrow('page is not available')
    const rollback = await service.rollback(spec, first.id)
    expect(service.content(spec, rollback.id)).toEqual({ pages: first.changeSet.pages, productOrder: [] })
    expect(service.content(spec, second.id).theme).toEqual(theme)
    const afterRollback = await service.createRevision(spec, {}, 'user')
    expect(service.content(spec, afterRollback.id)).toEqual(service.content(spec, first.id))
    const restored = new InMemorySiteService(new Context())
    restored.restore(service.snapshot())
    expect(restored.content(spec, afterRollback.id)).toEqual(service.content(spec, first.id))
  })

  it('reports page content and ordering changes and refuses cross-tenant previews', async () => {
    const service = new InMemorySiteService(new Context())
    const site = service.createSite(TenantId('owner'), 'Store', StoreConnectionId('store'))
    const spec = { tenantId: site.tenantId, siteId: site.id }
    const first = await service.createRevision(spec, { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Original' }] }, 'user')
    const second = await service.createRevision(spec, { pages: [{ id: 'sale', kind: 'campaign', path: '/sale', title: 'Sale' }, { id: 'home', kind: 'home', path: '/', title: 'Updated' }] }, 'user')
    const diff = service.diff(spec, second.id, first.id)
    expect(diff.added.map(page => page.id)).toEqual(['sale'])
    expect(diff.changed[0]?.before.title).toBe('Original')
    expect(diff.changed[0]?.after.title).toBe('Updated')
    expect(diff.pageOrderChanged).toBe(true)
    expect(() => service.preview({ ...spec, tenantId: TenantId('other') }, second.id, 'home', 'https://example.test')).toThrow('tenant')
    await expect(service.createRevision(spec, { baseRevisionId: first.id }, 'user')).rejects.toThrow('conflict')
  })
})
