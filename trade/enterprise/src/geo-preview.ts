/** Deterministic, authenticated product preview; HTML and JSON-LD use the same reviewed facts. */
import type { GeoRecord } from './geo-schema.ts'
import { productReadiness } from './geo-product.ts'

const copy = {
  en: { applications: 'Applications', customers: 'Customers', differences: 'Differentiators', limitations: 'Limitations', facts: 'Specifications', offers: 'Commercial offers', evidence: 'Evidence', variants: 'Variants', solutions: 'Related solutions', updated: 'Human review', unknown: 'Unknown', manufacturer: 'Manufacturer' },
  'zh-CN': { applications: '应用场景', customers: '适用客户', differences: '差异化', limitations: '限制', facts: '产品规格', offers: '商业报价', evidence: '证据', variants: '产品变体', solutions: '相关解决方案', updated: '人工审核时间', unknown: '未知', manufacturer: '制造商' },
} as const

function escape(value: unknown): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

/**
 * Compile reviewed content without publishing it or exposing private facts and sources.
 * @param record - Exact persisted revision confirmed by a human.
 * @param now - Time at which evidence and offers must still be valid.
 * @returns Matching HTML and structured data, or null when content is not ready.
 */
export function productPreview(record: GeoRecord, now: Date) {
  const product = record.product
  if (record.kind !== 'product' || record.status !== 'confirmed' || !product || !productReadiness(product, Boolean(record.productVerifiedAt), now).previewReady) return null
  const words = copy[product.locale]
  const claims = product.claims.filter(claim => claim.public)
  const known = claims.filter(claim => claim.status === 'declared' && claim.value.type !== 'unknown')
  const format = (claim: typeof claims[number]) => {
    const value = claim.value
    switch (value.type) {
      case 'unknown': return words.unknown
      case 'range': return `${value.min} - ${value.max} ${value.unit}`
      case 'number': return `${value.value} ${value.unit}`
      case 'boolean': return String(value.value)
      case 'text': return value.value
    }
  }
  const evidence = product.evidence.filter(source => source.public && known.some(claim => claim.evidenceIds.includes(source.id)))
  const reference = (item: { name: string; url: string }) => `<a href="${escape(item.url)}">${escape(item.name)}</a>`
  const list = (title: string, items: string[]) => items.length ? `<section><h2>${escape(title)}</h2><ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul></section>` : ''
  const facts = (items: typeof claims) => `<dl>${items.map(claim => `<dt>${escape(claim.name)}</dt><dd>${escape(format(claim))}</dd>`).join('')}</dl>`
  const standard = new Set(['material', 'color', 'pattern', 'size'])
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': `${product.identity.canonicalUrl}#product`,
    name: record.name, url: product.identity.canonicalUrl, description: product.understanding.directAnswer,
    alternateName: product.identity.aliases, category: product.identity.category,
    manufacturer: { '@type': 'Organization', '@id': product.identity.manufacturer.url, name: product.identity.manufacturer.name },
    sku: product.identity.sku, mpn: product.identity.mpn, gtin: product.identity.gtin,
    brand: product.identity.brand ? { '@type': 'Brand', name: product.identity.brand } : undefined,
    image: product.media.map(media => media.url),
    isVariantOf: product.identity.productGroup ? { '@type': 'ProductGroup', '@id': product.identity.productGroup.url, name: product.identity.productGroup.name } : undefined,
    additionalProperty: known.filter(claim => !standard.has(claim.property)).map(claim => ({ '@type': 'PropertyValue', propertyID: claim.property, name: claim.name, value: format(claim) })),
    ...Object.fromEntries(known.filter(claim => standard.has(claim.property)).map(claim => [claim.property, format(claim)])),
  }
  // A price is an offer value with a currency and ordering unit, never a guessed product property.
  const offers = product.publication.shopifyVariants.flatMap(variant => variant.price && variant.currency ? [{ '@type': 'Offer', '@id': `${product.identity.canonicalUrl}#offer-${encodeURIComponent(variant.id)}`, seller: { '@type': 'Organization', '@id': product.identity.manufacturer.url, name: product.identity.manufacturer.name }, price: variant.price, priceCurrency: variant.currency, availability: variant.availableForSale === undefined ? undefined : `https://schema.org/${variant.availableForSale ? 'InStock' : 'OutOfStock'}` }] : [])
  if (offers.length) jsonLd.offers = offers
  const details = product.publication.shopifyVariants.map(variant => `<section><h3>${escape(variant.id)}</h3><p>${variant.price && variant.currency ? `${escape(variant.price)} ${escape(variant.currency)}` : escape(words.unknown)} · ${variant.availableForSale === undefined ? escape(words.unknown) : escape(variant.availableForSale ? 'In stock' : 'Out of stock')}</p></section>`).join('')
  const identity = ['sku', 'mpn', 'gtin', 'brand'] as const
  const html = `<!doctype html><html lang="${product.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(record.name)}</title><link rel="canonical" href="${escape(product.identity.canonicalUrl)}"><script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll('<', '\\u003c')}</script><style>body{margin:0;color:#202622;background:#fff;font:16px/1.6 system-ui}main{max-width:960px;margin:auto;padding:32px 20px}h1{font-size:32px;line-height:1.2;overflow-wrap:anywhere}h2{font-size:21px;margin-top:32px}a{color:#126b50;overflow-wrap:anywhere}section{border-top:1px solid #dce3de;margin-top:24px}dl{display:grid;grid-template-columns:minmax(100px,1fr) minmax(0,2fr);gap:8px 20px}dt,dd{margin:0;overflow-wrap:anywhere}dt{color:#526158}img{width:100%;max-height:480px;object-fit:contain}p,li{overflow-wrap:anywhere}footer{margin-top:32px;color:#526158}</style></head><body><main><h1>${escape(record.name)}</h1><p>${escape(product.understanding.directAnswer)}</p>${product.media.map(media => `<img src="${escape(media.url)}" alt="${escape(media.alt)}" loading="lazy" referrerpolicy="no-referrer">`).join('')}<p>${escape(words.manufacturer)}: ${reference(product.identity.manufacturer)}</p><p>${escape(product.identity.category.join(' / '))}</p><p>${escape(product.identity.aliases.join(', '))}</p><dl>${identity.filter(key => product.identity[key]).map(key => `<dt>${key}</dt><dd>${escape(product.identity[key])}</dd>`).join('')}</dl>${list(words.applications, product.understanding.applications)}${list(words.customers, product.understanding.targetCustomers)}${list(words.differences, product.understanding.differentiators)}${list(words.limitations, product.understanding.limitations)}<section><h2>${escape(words.facts)}</h2>${facts(claims)}</section>${details ? `<section><h2>${escape(words.offers)}</h2></section>${details}` : ''}${product.identity.productGroup ? `<p>${reference(product.identity.productGroup)}</p>` : ''}${product.variants.length ? `<section><h2>${escape(words.variants)}</h2>${product.variants.map(reference).join(' · ')}</section>` : ''}${product.solutions.length ? `<section><h2>${escape(words.solutions)}</h2>${product.solutions.map(reference).join(' · ')}</section>` : ''}${evidence.length ? `<section><h2>${escape(words.evidence)}</h2>${evidence.map(source => `<p>${source.url ? reference({ name: source.title, url: source.url }) : escape(source.title)}: ${escape(source.citation)} · ${escape(source.recordedAt)}</p>`).join('')}</section>` : ''}<footer>${escape(words.updated)}: ${escape(record.confirmedAt)}</footer></main></body></html>`
  const language = product.locale === 'zh-CN' ? 'zh-CN' : 'en'
  const localizedHtml = html.replace('<link rel="canonical"', `<link rel="alternate" hreflang="${language}" href="${escape(product.identity.canonicalUrl)}"><link rel="alternate" hreflang="x-default" href="${escape(product.identity.canonicalUrl)}"><link rel="canonical"`)
  return { html: localizedHtml, jsonLd }
}
