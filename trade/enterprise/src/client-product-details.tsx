/** Human review exposes every structured source fact independently of publication state. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { GeoProduct } from './geo-product.ts'

type T = PropsLocale<'enterprise'>['t']
type Reference = GeoProduct['identity']['manufacturer']

function ReferenceLink({ reference }: { reference: Reference }) {
  return <><a href={reference.url} target="_blank" rel="noreferrer">{reference.name}</a><small>{reference.id} · {reference.url}</small></>
}

/**
 * Render identity, conditions, claims and their sources before a product is confirmed.
 * @param props - Persisted structured fields and the enterprise locale.
 * @returns Expandable, complete business content with external media presented as links.
 */
export function ProductDetails({ product, t }: { product: GeoProduct; t: T }) {
  const identity = product.identity
  const states = { declared: 'productDeclared', inferred: 'productInferred', conflicted: 'productConflicted', outdated: 'productOutdated', unknown: 'notSet' } as const
  const categories = { technical: 'productTechnical', application: 'productApplication', commercial: 'productCommercial', supply: 'productSupply', customization: 'productCustomization' } as const
  const visibility = (visible: boolean) => t(visible ? 'productPublic' : 'productPrivate')
  const claimValue = (value: GeoProduct['claims'][number]['value']) => value.type === 'unknown' ? t('notSet') : value.type === 'range' ? `${value.min}–${value.max} ${value.unit}` : value.type === 'boolean' ? t(value.value ? 'productYes' : 'productNo') : `${value.value}${value.type === 'number' ? ` ${value.unit}` : ''}`
  return <details className="ent-product-structured"><summary>{t('productStructured')}</summary><p>{t('productStructuredHint')}</p>
    <h4>{t('productIdentity')}</h4><dl>
      <div><dt>{t('website')}</dt><dd><a href={identity.canonicalUrl} target="_blank" rel="noreferrer">{identity.canonicalUrl}</a></dd></div>
      <div><dt>{t('productManufacturer')}</dt><dd><ReferenceLink reference={identity.manufacturer} /></dd></div>
      {(['sku', 'mpn', 'gtin'] as const).map(key => identity[key] && <div key={key}><dt>{key.toUpperCase()}</dt><dd>{identity[key]}</dd></div>)}
      {identity.brand && <div><dt>{t('productBrand')}</dt><dd>{identity.brand}</dd></div>}
      <div><dt>{t('productCategory')}</dt><dd>{identity.category.join(' / ')}</dd></div>
      <div><dt>{t('productAliases')}</dt><dd>{identity.aliases.join(' / ')}</dd></div>
      {identity.productGroup && <div><dt>{t('productGroup')}</dt><dd><ReferenceLink reference={identity.productGroup} /></dd></div>}
      <div><dt>{t('productLocale')}</dt><dd>{product.locale}</dd></div>
    </dl><p>{product.understanding.directAnswer}</p><dl>
      {(['applications', 'targetCustomers', 'differentiators', 'limitations'] as const).map(key => <div key={key}><dt>{t(({ applications: 'productApplications', targetCustomers: 'productCustomers', differentiators: 'productDifferentiators', limitations: 'productLimitations' } as const)[key])}</dt><dd>{product.understanding[key].join('\n') || t('notSet')}</dd></div>)}
    </dl><h4>{t('productClaims')}</h4><dl>{product.claims.map(claim => <div key={claim.id}><dt>{claim.name}</dt><dd>{claimValue(claim.value)}<small>{t(categories[claim.category])} · {t(states[claim.status])} · {visibility(claim.public)}{claim.critical && ` · ${t('productCritical')}`}</small><small>{claim.id} · {claim.property}</small><small>{t('productUpdated')}: {claim.updatedAt}{claim.validUntil && ` · ${t('productValidUntil')}: ${claim.validUntil}`}</small><small>{t('productEvidence')}: {claim.evidenceIds.map(id => product.evidence.find(item => item.id === id)?.title ?? id).join(' / ') || t('notSet')}</small></dd></div>)}</dl>
    {product.offers.length > 0 && <><h4>{t('productOffers')}</h4><dl>{product.offers.map(offer => <div key={offer.id}><dt>{offer.id} · {offer.currency} / {offer.unit}</dt><dd><ReferenceLink reference={offer.seller} /><small>{t('productClaims')}: {offer.claimIds.map(id => product.claims.find(claim => claim.id === id)?.name ?? id).join(' / ')}</small><small>{t('productRegions')}: {offer.regions.join(' / ')}</small><small>{t('productValidUntil')}: {offer.validUntil}</small></dd></div>)}</dl></>}
    <h4>{t('productEvidence')}</h4><dl>{product.evidence.map(evidence => <div key={evidence.id}><dt>{evidence.title}</dt><dd>{evidence.citation}<small>{evidence.id} · {visibility(evidence.public)} · {t('productUpdated')}: {evidence.recordedAt}</small>{evidence.url && <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.url}</a>}</dd></div>)}</dl>
    {(['variants', 'solutions'] as const).map(key => product[key].length > 0 && <section key={key}><h4>{t(key === 'variants' ? 'productVariants' : 'productSolutions')}</h4>{product[key].map(reference => <p key={reference.id}><ReferenceLink reference={reference} /></p>)}</section>)}
    {product.media.length > 0 && <section><h4>{t('productMedia')}</h4>{product.media.map((media, index) => <p key={index}><a href={media.url} target="_blank" rel="noreferrer">{media.alt}</a><small>{media.url}</small></p>)}</section>}
  </details>
}
