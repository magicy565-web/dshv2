import type { ShopifyStoreProvider } from '@deepseek-ai/dsh-shopify'
import type { Site, SiteRevision, SitePublisher } from './index.ts'
import type { SitePage } from './types.ts'

/** Render a detached site revision into approved Shopify theme files. */
export type SiteThemeRenderer = (site: Site, revision: SiteRevision) => Readonly<Record<string, string>>

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function pageFile(page: SitePage): string {
  const path = page.path === '/' ? 'index' : page.path.slice(1).replace(/[^a-zA-Z0-9/_-]/g, '-').replace(/\//g, '_')
  return `templates/${path || 'index'}.liquid`
}

/** Render revision pages into a small, controlled Shopify theme file set. */
export function renderShopifyThemeFiles(_site: Site, revision: SiteRevision): Readonly<Record<string, string>> {
  const pages = revision.changeSet.pages ?? []
  const files: Record<string, string> = {
    'layout/theme.liquid': '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>',
    'config/settings_data.json': JSON.stringify({ current: {}, presets: {} }),
  }
  for (const page of pages) {
    const title = page.seo?.title ?? page.title
    const description = page.seo?.description
    const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': page.kind === 'product' ? 'Product' : 'WebPage', name: page.title, url: page.path }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    files[pageFile(page)] = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${description === undefined ? '' : `<meta name="description" content="${escapeHtml(description)}">`}<script type="application/ld+json">${jsonLd}</script></head><body><main><h1>${escapeHtml(page.title)}</h1></main></body></html>`
  }
  return files
}

/** Create a Site publisher that sends one immutable revision to Shopify. */
export function createShopifySitePublisher(provider: ShopifyStoreProvider, themeId: string, render: SiteThemeRenderer): SitePublisher {
  if (!/^gid:\/\/shopify\/Theme\//.test(themeId)) throw new Error('invalid Shopify theme id')
  return async (site, revision) => {
    const files = render(site, revision)
    await provider.publish({ mode: 'oauth', connectionId: site.connectionId, tenantId: site.tenantId, requiredScopes: ['write_themes'] }, {
      connectionId: site.connectionId,
      themeId: themeId as never,
      files,
      idempotencyKey: `site-revision:${revision.id}`,
    })
  }
}
