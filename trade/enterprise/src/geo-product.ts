/** Structured product drafts and evidence checks; agent input cannot assert human verification. */
import { z } from 'zod'

const text = z.string().trim().min(1).max(3000)
const webUrl = z.url({ protocol: /^https?$/ }).refine(value => {
  const url = new URL(value)
  return !url.username && !url.password
}, 'URLs must not contain credentials')
const reference = z.object({ id: text, name: text, url: webUrl }).strict()
const value = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: text }).strict(),
  z.object({ type: z.literal('number'), value: z.number(), unit: text }).strict(),
  z.object({ type: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('range'), min: z.number(), max: z.number(), unit: text }).strict(),
  z.object({ type: z.literal('unknown') }).strict(),
])

/** Product facts belong to claims; offers reference them without copying their values. */
export const geoProduct = z.object({
  /** External publication state is persisted separately from source facts. */
  publication: z.object({
    shopifyProductId: z.string().optional(), shopifyVariantIds: z.record(z.string(), z.string()).optional(),
    status: z.enum(['pending', 'synced', 'failed']).default('pending'), syncedAt: z.iso.datetime().optional(),
    error: text.optional(), version: z.number().int().nonnegative().optional(), fingerprint: text.optional(), publicUrl: webUrl.optional(),
    siteStatus: z.enum(['pending', 'published', 'unpublished', 'failed']).default('pending'), siteSlug: text.optional(), publishedAt: z.iso.datetime().optional(), unpublishedAt: z.iso.datetime().optional(), contentVersion: z.number().int().nonnegative().default(0),
    shopifyVariants: z.array(z.object({ id: text, price: z.string().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), availableForSale: z.boolean().optional(), inventoryQuantity: z.number().int().optional(), updatedAt: z.iso.datetime() }).strict()).default([]), shopifyStateUpdatedAt: z.iso.datetime().optional(),
  }).strict().prefault({}),
  identity: z.object({
    canonicalUrl: webUrl, manufacturer: reference, aliases: z.array(text).max(50),
    category: z.array(text).max(20), sku: text.optional(), mpn: text.optional(),
    gtin: z.string().regex(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/).optional(),
    brand: text.optional(), productGroup: reference.optional(),
  }).strict(),
  locale: z.enum(['en', 'zh-CN']),
  understanding: z.object({
    directAnswer: z.string().trim().max(3000), applications: z.array(text).max(30),
    targetCustomers: z.array(text).max(30), differentiators: z.array(text).max(30),
    limitations: z.array(text).max(30),
  }).strict(),
  claims: z.array(z.object({
    id: text, property: z.string().regex(/^[a-z][a-z0-9_]*$/).max(80), name: text,
    category: z.enum(['technical', 'application', 'commercial', 'supply', 'customization']),
    value, public: z.boolean(), critical: z.boolean(),
    status: z.enum(['declared', 'inferred', 'conflicted', 'outdated', 'unknown']),
    evidenceIds: z.array(text).max(20), updatedAt: z.iso.datetime(), validUntil: z.iso.datetime().optional(),
  }).strict()).max(100),
  evidence: z.array(z.object({
    id: text, title: text, citation: text, recordedAt: z.iso.datetime(),
    url: webUrl.optional(), public: z.boolean(),
  }).strict()).max(100),
  offers: z.array(z.object({
    id: text, seller: reference, claimIds: z.array(text).max(30),
    currency: z.string().regex(/^[A-Z]{3}$/), unit: text,
    regions: z.array(text).max(50), validUntil: z.iso.datetime(),
  }).strict()).max(20),
  variants: z.array(reference).max(50), solutions: z.array(reference).max(50),
  media: z.array(z.object({ url: webUrl, alt: text }).strict()).max(20),
}).strict()

/** Validated structured content, kept with the draft's identity and revision. */
export type GeoProduct = z.infer<typeof geoProduct>
/** Independent readiness layers; internal preview never proves public discovery. */
export type GeoLayer = 'entity' | 'understanding' | 'facts' | 'evidence' | 'sitePublication' | 'discovery' | 'shopifySync'
/** A specific condition preventing readiness. */
export interface GeoIssue { layer: GeoLayer; code: string; subject: string }

/**
 * Evaluate a product at an explicit time without fetching or trusting model verification.
 * @param product - Structured draft, absent for legacy free-text records.
 * @param confirmed - Whether the stored product has a separate human fact-verification receipt.
 * @param now - Evaluation time; expired claims are checked on every request.
 * @returns Per-layer status and actionable failures, without a numeric score.
 */
export function productReadiness(product: GeoProduct | undefined, confirmed: boolean, now: Date) {
  const issues: GeoIssue[] = []
  const add = (layer: GeoLayer, code: string, subject: string) => issues.push({ layer, code, subject })
  if (!product) {
    for (const layer of ['entity', 'understanding', 'facts', 'evidence'] as const) add(layer, 'structured_product_missing', 'product')
  } else {
    if (!product.identity.category.length) add('entity', 'category_missing', 'identity.category')
    const gtin = product.identity.gtin
    if (gtin && [...gtin].reverse().reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 !== 0) add('entity', 'gtin_checksum', 'identity.gtin')
    for (const key of ['directAnswer', 'applications', 'targetCustomers', 'differentiators'] as const) {
      if (!product.understanding[key].length) add('understanding', 'required_content_missing', key)
    }
    if (!product.claims.some(claim => claim.category === 'technical' && claim.public && claim.value.type !== 'unknown')) add('facts', 'specifications_missing', 'claims')
    for (const [subject, records] of [['claims', product.claims], ['evidence', product.evidence], ['offers', product.offers], ['variants', product.variants]] as const) {
      if (new Set(records.map(record => record.id)).size !== records.length) add('facts', 'duplicate_id', subject)
    }
    if (new Set(product.claims.map(claim => claim.property)).size !== product.claims.length) add('facts', 'duplicate_property', 'claims')
    if (!confirmed) add('evidence', 'human_review_required', 'product')
    const commercial = new Set(['price', 'moq', 'lead_time', 'availability', 'capacity', 'certificate', 'warranty', 'performance'])
    for (const claim of product.claims) {
      if (claim.value.type === 'range' && claim.value.min > claim.value.max) add('facts', 'invalid_range', claim.id)
      const unit = claim.value.type === 'number' || claim.value.type === 'range' ? claim.value.unit : undefined
      if (claim.value.type !== 'unknown' && ((claim.property === 'fabric_weight' && unit !== 'g/m²') || (claim.property === 'fabric_width' && unit !== 'cm'))) add('facts', 'unit_not_normalized', claim.id)
      if (new Date(claim.updatedAt) > now) add('evidence', 'future_timestamp', claim.id)
      if (!claim.public) continue
      if (claim.value.type === 'unknown' && claim.status === 'unknown') continue
      if (claim.status !== 'declared' || claim.value.type === 'unknown') add('evidence', 'claim_not_confirmable', claim.id)
      if (!claim.evidenceIds.length) add('evidence', 'source_missing', claim.id)
      for (const id of claim.evidenceIds) {
        const source = product.evidence.find(item => item.id === id)
        if (!source) add('evidence', 'source_missing', claim.id)
        else if (new Date(source.recordedAt) > now) add('evidence', 'future_timestamp', id)
      }
      if (claim.validUntil && new Date(claim.validUntil) <= now) add('evidence', 'claim_expired', claim.id)
      if (commercial.has(claim.property) && !claim.validUntil) add('evidence', 'expiry_required', claim.id)
    }
    const assigned = new Set<string>()
    for (const offer of product.offers) {
      if (new Date(offer.validUntil) <= now) add('evidence', 'offer_expired', offer.id)
      for (const id of offer.claimIds) {
        const claim = product.claims.find(item => item.id === id)
        if (!claim || !['commercial', 'supply'].includes(claim.category)) add('facts', 'offer_claim_invalid', id)
        if (claim?.property === 'price' && claim.value.type !== 'unknown' && (claim.value.type !== 'number' || claim.value.value < 0 || claim.value.unit !== offer.unit)) add('facts', 'price_invalid', id)
        if (assigned.has(id)) add('facts', 'offer_claim_reused', id)
        assigned.add(id)
      }
    }
    for (const claim of product.claims) {
      if (claim.category === 'commercial' && !assigned.has(claim.id)) add('facts', 'offer_missing', claim.id)
    }
    if (product.variants.length && !product.identity.productGroup) add('facts', 'product_group_missing', 'variants')
  }
  add('discovery', 'public_deployment_required', 'canonicalUrl')
  if (!product?.publication || product.publication.siteStatus !== 'published') add('sitePublication', 'site_publication_required', 'publication.siteStatus')
  if (product?.publication.status !== 'synced') add('shopifySync', product?.publication.status === 'failed' ? 'shopify_sync_failed' : 'shopify_sync_required', 'publication.status')
  const layers = Object.fromEntries((['entity', 'understanding', 'facts', 'evidence', 'sitePublication', 'discovery', 'shopifySync'] as const).map(layer => [layer, issues.some(issue => issue.layer === layer) ? 'PARTIAL' : 'READY']))
  return { layers, issues, previewReady: !issues.some(issue => !['discovery', 'sitePublication', 'shopifySync'].includes(issue.layer)), publicationReady: issues.length === 0, publicationStatus: product?.publication.status ?? 'pending', siteStatus: product?.publication.siteStatus ?? 'pending' }
}

/**
 * Normalize supported fabric units without inferring missing measurements.
 * @param product - Parsed product draft.
 * @returns A copy with GSM aliases and width measurements expressed consistently.
 */
export function normalizeProduct(product: GeoProduct): GeoProduct {
  return { ...product, claims: product.claims.map(claim => {
    const value = claim.value
    if (value.type !== 'number' && value.type !== 'range') return claim
    const unit = value.unit.toLowerCase().replaceAll(' ', '')
    if (claim.property === 'fabric_weight' && ['gsm', 'g/m2', 'g/m²'].includes(unit)) return { ...claim, value: { ...value, unit: 'g/m²' } }
    if (claim.property === 'fabric_width' && ['m', 'cm', 'mm'].includes(unit)) {
      const factor = unit === 'm' ? 100 : unit === 'mm' ? 0.1 : 1
      return { ...claim, value: value.type === 'number' ? { ...value, value: value.value * factor, unit: 'cm' } : { ...value, min: value.min * factor, max: value.max * factor, unit: 'cm' } }
    }
    return claim
  }) }
}
