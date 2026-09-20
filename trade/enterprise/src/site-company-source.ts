/** Project submitted company records and currently publishable product facts into a reviewable website draft. */
import { createHash } from 'node:crypto'
import type { Profile } from './schema.ts'
import type { GeoRecord } from './geo-schema.ts'
import { productReadiness } from './geo-product.ts'
import { siteCompanyContent, siteCompanyReview } from './site-company-schema.ts'

/** Produce an explicit review projection; no private evidence or unverified product fields are copied.
 * @param profile - Submitted company profile, or null when unavailable.
 * @param records - Current GEO records.
 * @param inquiryEndpoint - Local receiver marker, or null when unavailable.
 * @param now - Evidence expiry evaluation time.
 * @returns Content, omissions and a digest that changes when public source values change.
 */
export function companySiteReview(profile: Profile | null, records: readonly GeoRecord[], inquiryEndpoint: string | null, now: Date) {
  const issues: string[] = []
  if (!profile?.description.trim()) issues.push('profileMissing')
  const superseded = new Set(records.filter(record => record.status === 'confirmed').map(record => record.supersedesId))
  const products = records.flatMap(record => {
    if (record.kind !== 'product' || superseded.has(record.id)) return []
    if (record.status !== 'confirmed' || !record.product || !productReadiness(record.product, Boolean(record.productVerifiedAt), now).previewReady) { issues.push('productExcluded'); return [] }
    const product = record.product
    return [{ slug: `product-${record.id}`, name: record.name, description: product.understanding.directAnswer,
      applications: product.understanding.applications,
      specifications: product.claims.filter(claim => claim.public && claim.status === 'declared' && claim.value.type !== 'unknown').map(claim => {
        const value = claim.value
        return { name: claim.name, value: value.type === 'range' ? `${value.min}–${value.max} ${value.unit}` : value.type === 'number' ? `${value.value} ${value.unit}` : value.type === 'unknown' ? '' : String(value.value) }
      }),
    }]
  })
  if (!products.length) issues.push('productsMissing')
  if (!inquiryEndpoint) issues.push('inquiryUnavailable')
  const content = profile?.description.trim() ? siteCompanyContent.parse({ name: profile.name, description: profile.description, business: profile.business, email: profile.email, phone: profile.phone, address: profile.address, products,
    qualifications: profile.trust.claims.filter(claim => claim.visibility === 'PUBLIC' && claim.status === 'VERIFIED' && (!claim.validUntil || Date.parse(claim.validUntil) > now.getTime()) && typeof claim.value === 'string').map(claim => claim.value),
  }) : null
  const value = { content, issues: [...new Set(issues)], inquiryEndpoint }
  return siteCompanyReview.parse({ ...value, digest: createHash('sha256').update(JSON.stringify(value)).digest('hex') })
}
