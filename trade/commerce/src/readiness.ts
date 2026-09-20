/** Evidence-backed readiness with explicit missing facts and no numeric score. */
import type { Fact, Records } from './schema.ts'

/** Return a confirmed value only while every referenced source is current and bound to it.
 * @param fact - Stored fact.
 * @param evidence - Evidence available to the evaluation.
 * @param entityId - Expected source entity.
 * @param field - Expected source field.
 * @param now - Evaluation time.
 * @returns Whether the fact can support commercial use.
 */
export function supported(fact: Fact | undefined, evidence: Records['evidence'][], entityId: string, field: string, now: string): boolean {
  return !!fact && ['USER_CONFIRMED', 'DOCUMENT_SUPPORTED', 'VERIFIED'].includes(fact.status)
    && fact.value !== null && fact.evidenceIds.length > 0
    && fact.evidenceIds.every(key => evidence.some(e => e.id === key && e.entityId === entityId && e.field === field
      && JSON.stringify(e.value) === JSON.stringify(fact.value) && !e.revoked && (!e.validUntil || e.validUntil > now)
      && ['USER_CONFIRMED', 'DOCUMENT_SUPPORTED', 'VERIFIED'].includes(e.verificationStatus)))
}
/** Evaluate product completeness and commercial eligibility.
 * @param product - Product lifecycle record.
 * @param passport - Canonical facts.
 * @param company - Supplier identity.
 * @param evidence - Source receipts.
 * @param now - Evaluation time.
 * @returns Readiness state and fields requiring confirmation.
 */
export function readiness(product: Records['product'], passport: Records['passport'], company: Records['company'], evidence: Records['evidence'][], now: string) {
  const missing: string[] = []
  const check = (field: keyof typeof passport.facts): boolean => {
    const f = passport.facts[field]
    const ok = supported(f, evidence, passport.id, field, now) && f?.visibility === 'PUBLIC'
    if (!ok) missing.push(field)
    return ok
  }
  for (const key of ['identity.product_name', 'identity.category', 'identity.manufacturer', 'specifications.technical_specs', 'evidence.product_images'] as const) check(key)
  for (const key of ['identity.product_name', 'identity.category', 'identity.manufacturer', 'specifications.technical_specs'] as const) if (typeof passport.facts[key]?.value !== 'string') missing.push(`${key}:text_required`)
  const images = passport.facts['evidence.product_images']?.value
  if (!Array.isArray(images) || !images.length || images.some(v => { try { const u = new URL(v); return u.protocol !== 'https:' || !!u.username || !!u.password } catch { return true } })) missing.push('evidence.product_images:valid_https_images')
  for (const key of ['legal_name', 'factory_status', 'contacts'] as const) if (!supported(company.facts[key], evidence, company.id, key, now)) missing.push(`company.${key}`)
  if (company.facts.factory_status?.value !== true) missing.push('company.factory_status:confirmed_factory')
  const dataIncomplete = missing.length > 0
  for (const key of ['commercial.moq', 'commercial.sample', 'commercial.lead_time', 'commercial.price_basis', 'commercial.currency', 'customization.private_label', 'fulfillment.shipping'] as const) check(key)
  for (const key of ['commercial.sample', 'commercial.lead_time', 'commercial.price_basis', 'fulfillment.shipping'] as const) if (typeof passport.facts[key]?.value !== 'string') missing.push(`${key}:text_required`)
  if (typeof passport.facts['commercial.moq']?.value !== 'number' || Number(passport.facts['commercial.moq']?.value) <= 0) missing.push('commercial.moq:positive_number')
  if (typeof passport.facts['customization.private_label']?.value !== 'boolean') missing.push('customization.private_label:boolean')
  if (!/^[A-Z]{3}$/.test(String(passport.facts['commercial.currency']?.value))) missing.push('commercial.currency:iso_code')
  const cost = passport.facts['commercial.cost']?.value
  if (cost !== undefined && cost !== null && (typeof cost !== 'number' || cost < 0)) missing.push('commercial.cost:nonnegative_number')
  for (const [key, f] of Object.entries(passport.facts)) if (f.status === 'CONFLICTING') missing.push(`${key}:conflict`)
  const status = product.paused ? 'PAUSED' : !Object.keys(passport.facts).length ? 'DRAFT' : dataIncomplete ? 'DATA_INCOMPLETE' : missing.length ? 'COMMERCIAL_INCOMPLETE' : 'OPPORTUNITY_READY'
  return { status, missing: [...new Set(missing)] }
}
