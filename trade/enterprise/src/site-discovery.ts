/** Standards-based HTML metadata and sitemap output for the exact published website. */
import { parse, parseFragment, serialize, defaultTreeAdapter, type DefaultTreeAdapterMap } from 'parse5'
import { SitemapStream, streamToPromise } from 'sitemap'
import type { SiteGrowth } from './site-growth-schema.ts'

type Element = DefaultTreeAdapterMap['element']
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

/** Canonical path used in page metadata and the sitemap.
 * @param path - Artifact-relative HTML path.
 * @returns Directory URL for index pages, otherwise the file path.
 */
export function sitePagePath(path: string): string { return path.replace(/(^|\/)index\.html$/, '$1') }

/** Enrich a compiled page without executing its JavaScript.
 * @param html - Saved compiled HTML.
 * @param path - Artifact-relative page path.
 * @param base - Exact public website directory URL.
 * @param growth - Revision-owned optional integrations.
 * @returns HTML with canonical identity, absolute structured data and the official Umami tracker.
 */
export function discoverableHtml(html: string, path: string, base: string, growth: SiteGrowth): string {
  const document = parse(html)
  const root = document.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as Element
  const head = root.childNodes.find(node => 'tagName' in node && node.tagName === 'head') as Element
  const absolute = (value: unknown, property?: string): unknown => {
    if ((property === '@id' || property === 'url') && typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return new URL(value.slice(1), base).href
    if (Array.isArray(value)) return value.map(item => absolute(item, property))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, absolute(item, key)]))
    return value
  }
  for (const node of [...head.childNodes]) {
    if (!('tagName' in node)) continue
    if (node.tagName === 'link' && node.attrs.some(attr => attr.name === 'hreflang')) {
      const href = node.attrs.find(attr => attr.name === 'href')
      if (href) href.value = new URL(href.value.startsWith('/') && !href.value.startsWith('//') && !href.value.startsWith(new URL(base).pathname) ? href.value.slice(1) : href.value, base).href
    }
    if (node.tagName === 'link' && node.attrs.some(attr => attr.name === 'rel' && attr.value === 'canonical')) defaultTreeAdapter.detachNode(node)
    if (node.tagName === 'script' && node.attrs.some(attr => attr.name === 'type' && attr.value === 'application/ld+json')) {
      const data = node.childNodes.map(child => 'value' in child ? child.value : '').join('')
      node.childNodes = []
      defaultTreeAdapter.insertText(node, JSON.stringify(absolute(JSON.parse(data))).replaceAll('<', '\\u003c'))
    }
  }
  const canonical = new URL(sitePagePath(path), base).href
  const tags = [`<link rel="canonical" href="${escape(canonical)}">`]
  const title = head.childNodes.find(node => 'tagName' in node && node.tagName === 'title')
  const titleText = title && 'childNodes' in title ? title.childNodes.map(node => 'value' in node ? node.value : '').join('') : ''
  const description = head.childNodes.find(node => 'tagName' in node && node.tagName === 'meta' && node.attrs.some(attr => attr.name === 'name' && attr.value === 'description'))
  const descriptionText = description && 'attrs' in description ? description.attrs.find(attr => attr.name === 'content')?.value : undefined
  tags.push(`<meta property="og:url" content="${escape(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(titleText)}"><meta name="twitter:card" content="summary">`)
  if (descriptionText) tags.push(`<meta property="og:description" content="${escape(descriptionText)}">`)
  if (growth.analytics) tags.push(`<script>window.siteAnalyticsBeforeSend = function(type, payload) {
    var url = new URL(payload.url || location.pathname, location.origin), allowed = new URLSearchParams();
    for (var key of ['utm_source', 'utm_medium', 'utm_campaign']) { var value = url.searchParams.get(key); if (value) allowed.set(key, value.slice(0, 100)); }
    url.search = allowed.toString(); url.hash = '';
    var referrer = ''; try { if (payload.referrer) referrer = new URL(payload.referrer).origin; } catch { /* Invalid referrers are omitted. */ }
    return Object.assign({}, payload, { url: url.pathname + url.search, referrer: referrer });
  };</script><script defer src="${escape(growth.analytics.scriptUrl)}" data-website-id="${growth.analytics.websiteId}" data-before-send="siteAnalyticsBeforeSend" data-do-not-track="true" data-exclude-hash="true"></script>`)
  for (const child of [...parseFragment(tags.join('')).childNodes]) defaultTreeAdapter.appendChild(head, child)
  return serialize(document)
}

/** Render sitemap XML through the maintained sitemap library.
 * @param paths - Published HTML artifact paths.
 * @param base - Public directory URL with a trailing slash.
 * @returns Sitemap bytes as UTF-8 text.
 */
export async function siteSitemap(paths: readonly string[], base: string): Promise<string> {
  const stream = new SitemapStream({ hostname: new URL(base).origin })
  const result = streamToPromise(stream)
  for (const path of paths) stream.write({ url: new URL(sitePagePath(path), base).href })
  stream.end()
  return (await result).toString()
}
