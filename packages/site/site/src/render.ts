import type { SitePage, SiteRevision } from './types.ts'

function esc(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

/** Render a controlled page to standalone public HTML. */
export function renderSitePage(_revision: SiteRevision, page: SitePage, origin: string): string {
  const title = page.seo?.title ?? page.title
  const description = page.seo?.description
  const canonical = `${new URL(origin).origin}${page.path}`
  const meta = description === undefined ? '' : `<meta name="description" content="${esc(description)}">`
  const links = page.path === '/' ? '' : '<link rel="preload" as="document" href="/">'
  const jsonLd = renderPageJsonLd(page, origin).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${meta}<link rel="canonical" href="${esc(canonical)}">${links}<script type="application/ld+json">${jsonLd}</script></head><body><main><h1>${esc(page.title)}</h1></main></body></html>`
}

/** Render JSON-LD for a public page without exposing private source fields. */
export function renderPageJsonLd(page: SitePage, origin: string): string {
  const canonical = `${new URL(origin).origin}${page.path}`
  return JSON.stringify({ '@context': 'https://schema.org', '@type': page.kind === 'product' ? 'Product' : 'WebPage', name: page.title, url: canonical, ...(page.seo?.description === undefined ? {} : { description: page.seo.description }) })
}

/** Render a sitemap for the pages in a revision. */
export function renderSitemap(revision: SiteRevision, origin: string): string {
  const base = new URL(origin).origin
  const pages = revision.changeSet.pages ?? []
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(page => `<url><loc>${esc(base + page.path)}</loc></url>`).join('')}</urlset>`
}

/** Render robots policy pointing crawlers to the generated sitemap. */
export function renderRobots(origin: string): string {
  const base = new URL(origin).origin
  return `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`
}
