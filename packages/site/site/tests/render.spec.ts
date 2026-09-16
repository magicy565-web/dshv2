import { describe, expect, it } from 'vitest'
import { renderPageJsonLd, renderSitePage, renderSitemap, SiteId, SiteRevisionId } from '../src/index.ts'
describe('site rendering', () => {
  const revision = { id: SiteRevisionId('r'), siteId: SiteId('s'), createdAt: 'now', source: 'user' as const, changeSet: { pages: [{ id: 'home', kind: 'home' as const, path: '/', title: 'A&B' }] } }
  it('renders escaped canonical HTML, JSON-LD, and sitemap', () => { const html = renderSitePage(revision, revision.changeSet.pages![0]!, 'https://x.test/path'); expect(html).toContain('A&amp;B'); expect(html).toContain('application/ld+json'); expect(JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]!.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'))).toMatchObject({ '@type': 'WebPage', name: 'A&B' }); expect(renderPageJsonLd(revision.changeSet.pages![0]!, 'https://x.test')).toContain('WebPage'); expect(renderSitemap(revision, 'https://x.test')).toContain('<loc>https://x.test/</loc>') })
})
