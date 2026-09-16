import { describe, expect, it } from 'vitest'
import { renderShopifyThemeFiles } from '../src/shopify-publisher.ts'

describe('renderShopifyThemeFiles', () => {
  it('renders controlled pages, metadata and JSON-LD without accepting markup', () => {
    const files = renderShopifyThemeFiles({} as never, { id: 'revision' as never, siteId: 'site' as never, createdAt: '2026-01-01T00:00:00Z', source: 'agent', changeSet: { pages: [{ id: 'home', kind: 'home', path: '/', title: '<Home>', seo: { description: 'A & B' } }] } })
    expect(files['layout/theme.liquid']).toContain('{{ content_for_layout }}')
    expect(files['templates/index.liquid']).toContain('&lt;Home&gt;')
    expect(files['templates/index.liquid']).toContain('A &amp; B')
    expect(files['templates/index.liquid']).toContain('"@type":"WebPage"')
    expect(files['templates/index.liquid']).not.toContain('<Home>')
  })
})
