import type { ShopifyStoreProvider } from '@deepseek-ai/dsh-shopify'
import type { Site, SiteRevision, SitePublisher } from './index.ts'
import type { SitePage } from './types.ts'

/** Render a detached site revision into approved Shopify theme files. */
export type SiteThemeRenderer = (site: Site, revision: SiteRevision) => Readonly<Record<string, string>>

function escapeHtml(value: string): string {
  return value.replace(/[&<>"'{}]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;', '}': '&#125;' })[character] ?? character)
}

function pageFile(page: SitePage): string {
  return `templates/${page.kind === 'home' ? 'index' : page.kind === 'campaign' ? 'page' : page.kind}.liquid`
}

/** Render revision pages into controlled Shopify templates, escaping HTML and Liquid input.
 * @param _site - Owner supplied by the publisher.
 * @param revision - Resolved structured pages; source projects are rejected.
 * @returns Text files whose paths are valid Shopify theme paths.
 */
export function renderShopifyThemeFiles(_site: Site, revision: SiteRevision): Readonly<Record<string, string>> {
  const pages = revision.changeSet.pages ?? []
  if (revision.changeSet.project) throw new Error('Shopify publication requires controlled pages; source projects use local or independent hosting')
  const files: Record<string, string> = {
    'layout/theme.liquid': '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>',
    'config/settings_data.json': JSON.stringify({ current: {}, presets: {} }),
  }
  for (const page of pages) {
    if (files[pageFile(page)]) throw new Error('Shopify publication permits one controlled template per page kind')
    const title = page.seo?.title ?? page.title
    const description = page.seo?.description
    const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': page.kind === 'product' ? 'Product' : 'WebPage', name: page.title, url: page.path }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replaceAll('{{', '\\u007b{').replaceAll('{%', '\\u007b%')
    files[pageFile(page)] = `{% layout none %}<!doctype html><html><head>{{ content_for_header }}<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${description === undefined ? '' : `<meta name="description" content="${escapeHtml(description)}">`}<script type="application/ld+json">${jsonLd}</script></head><body><main><h1>${escapeHtml(page.title)}</h1></main></body></html>`
  }
  return files
}

/** Create a Site publisher that sends one immutable revision to Shopify.
 * @param provider - Authorized OAuth Admin provider.
 * @param themeId - Explicit OnlineStoreTheme global id.
 * @param render - Approved renderer for complete resolved content.
 * @returns Publisher whose completion follows provider confirmation.
 */
export function createShopifySitePublisher(provider: ShopifyStoreProvider, themeId: string, render: SiteThemeRenderer): SitePublisher {
  if (!/^gid:\/\/shopify\/OnlineStoreTheme\/\d+$/.test(themeId)) throw new Error('invalid Shopify theme id')
  return async (site, revision) => {
    if (!site.connectionId) throw new Error('Shopify publication requires a connected store')
    const files = render(site, revision)
    await provider.publish({ mode: 'oauth', connectionId: site.connectionId, tenantId: site.tenantId, requiredScopes: ['write_themes'] }, {
      connectionId: site.connectionId,
      themeId: themeId as never,
      files,
      idempotencyKey: `site-revision:${revision.id}`,
    })
  }
}
