/** Adapt existing enterprise records without guessing commercial terms or promoting source review. */
import { enterpriseTransfer } from '../../commerce/src/enterprise-wire.ts'
import type { EnterpriseTransfer } from '../../commerce/src/enterprise-wire.ts'
import type { Profile } from './schema.ts'
import type { GeoRecord } from './geo-schema.ts'

type SourceFact = NonNullable<EnterpriseTransfer['company']>['facts'][string & 'display_name']
const sourced = (value: NonNullable<SourceFact>['value'], sourceStatus: string, citation: string, validUntil: string | null = null, conflicting = false): NonNullable<SourceFact> => ({ value, sourceStatus, citation: citation.slice(0, 3000), validUntil, conflicting })

/** Export current records as private, reviewable facts; superseded confirmations are excluded.
 * @param profile - Existing enterprise identity, if established.
 * @param records - Persisted GEO revisions.
 * @returns Validated catalog; empty enterprises remain empty.
 */
export function exportCommerce(profile: Profile | null, records: GeoRecord[]): EnterpriseTransfer {
  if (!profile) return { version: 1, company: null, products: [] }
  const current = records.filter(r => !records.some(s => s.supersedesId === r.id && s.status === 'confirmed'))
  const company: NonNullable<EnterpriseTransfer['company']> = { sourceId: profile.companyEntityId ?? 'enterprise-profile', revision: 0, confirmedAt: null, facts: {
    display_name: sourced(profile.name, 'enterprise_profile', 'enterprise.profile.name'),
    ...(profile.identity.legalName ? { legal_name: sourced(profile.identity.legalName, 'enterprise_profile', 'enterprise.profile.identity.legalName') } : {}),
    ...(profile.website ? { website: sourced(profile.website, 'enterprise_profile', 'enterprise.profile.website') } : {}),
    ...([profile.contact, profile.email, profile.phone].some(Boolean) ? { contacts: sourced([profile.contact, profile.email, profile.phone].filter(Boolean).join(' · '), 'enterprise_profile', 'enterprise.profile.contacts') } : {}),
  } }
  const products = current.filter(r => r.kind === 'product').map(r => {
    const p = r.product
    const facts: EnterpriseTransfer['products'][number]['facts'] = { 'identity.product_name': sourced(r.name, r.status, `geo:${r.id}:name`) }
    if (p) {
      facts['identity.category'] = sourced(p.identity.category.join(' / ') || null, r.status, 'product.identity.category')
      facts['identity.manufacturer'] = sourced(p.identity.manufacturer.name, r.status, p.identity.manufacturer.url)
      if (p.identity.sku) facts['identity.sku'] = sourced(p.identity.sku, r.status, 'product.identity.sku')
      if (p.media.length) facts['evidence.product_images'] = sourced(p.media.map(m => m.url), r.status, 'product.media')
      const technical = p.claims.filter(c => c.category === 'technical')
      if (technical.length) {
        const known = technical.filter(c => c.value.type !== 'unknown' && c.status !== 'outdated')
        const text = known.map(c => `${c.name}: ${c.value.type === 'range' ? `${c.value.min}–${c.value.max} ${c.value.unit}` : c.value.type === 'number' ? `${c.value.value} ${c.value.unit}` : c.value.type === 'unknown' ? '' : String(c.value.value)}`).join('\n')
        if (text.length <= 4000) facts['specifications.technical_specs'] = sourced(text || null, known.map(c => c.status).join(',').slice(0, 80) || 'unknown', known.flatMap(c => c.evidenceIds.map(id => p.evidence.find(e => e.id === id)?.citation ?? `missing:${id}`)).join('\n'), technical.flatMap(c => c.validUntil ? [c.validUntil] : []).sort()[0] ?? null, technical.some(c => c.status === 'conflicted'))
      }
      const mapping = { moq: 'commercial.moq', sample: 'commercial.sample', sample_policy: 'commercial.sample', lead_time: 'commercial.lead_time', price_basis: 'commercial.price_basis', private_label: 'customization.private_label', shipping: 'fulfillment.shipping' } as const
      for (const [property, destination] of Object.entries(mapping)) {
        const claims = p.claims.filter(c => c.property === property)
        if (claims.length !== 1) continue
        const c = claims[0]!
        let value: NonNullable<SourceFact>['value'] = null
        if (c.status !== 'outdated' && c.value.type !== 'unknown' && c.value.type !== 'range') {
          value = c.value.type === 'number' && destination !== 'commercial.moq' ? `${c.value.value} ${c.value.unit}` : c.value.value
        }
        facts[destination] = sourced(value, c.status, c.evidenceIds.map(id => p.evidence.find(e => e.id === id)?.citation ?? `missing:${id}`).join('\n'), c.validUntil ?? null, c.status === 'conflicted')
      }
    }
    return { sourceId: r.id, revision: r.revision, confirmedAt: r.confirmedAt, facts }
  })
  return enterpriseTransfer.parse({ version: 1, company, products })
}
