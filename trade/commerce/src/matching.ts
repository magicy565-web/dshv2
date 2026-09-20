/** Structured opportunity filtering and explanations grounded in confirmed facts. */
import type { Records, Fact } from './schema.ts'

/** Read a fact value for an already-validated projection.
 * @param facts - Confirmed projection.
 * @param key - Canonical field name.
 * @returns Value, or null for absent facts.
 */
export function value(facts: Record<string, Fact | undefined>, key: string) { return facts[key]?.value ?? null }
const words = (input: unknown): string[] => (Array.isArray(input) ? input.map(String) : [String(input ?? '')]).map(s => s.toLowerCase().trim())
const overlaps = (a: unknown, b: unknown) => words(a).some(x => x.length > 0 && words(b).some(y => y.length > 0 && (x.includes(y) || y.includes(x))))

/** Compare business constraints without an opaque suitability score.
 * @param profile - Supported merchant facts only.
 * @param passport - Supported, shareable product facts only.
 * @param opportunity - Current available opportunity.
 * @returns Grounded explanation, or null when a hard constraint excludes the product.
 */
export function matchOpportunity(profile: Record<string, Fact>, passport: Record<string, Fact>, opportunity: Records['opportunity']) {
  const m = (key: string) => value(profile, key)
  const p = (key: string) => value(passport, key)
  if (!overlaps(m('market'), opportunity.targetMarket)) return null
  if (!overlaps(m('strategy.preferred_categories'), p('identity.category'))) return null
  if (!overlaps(m('brand.audience'), opportunity.targetCustomerTypes)) return null
  const moq = p('commercial.moq'), tolerance = m('strategy.max_moq')
  if (typeof moq !== 'number' || typeof tolerance !== 'number' || moq > tolerance) return null
  if (m('strategy.currency') !== opportunity.currency) return null
  if (m('strategy.private_label') === true && p('customization.private_label') !== true) return null
  const risks: string[] = [], unknowns: string[] = []
  const retail = opportunity.suggestedRetailPrice, cost = p('commercial.cost')
  const low = m('brand.price_min'), high = m('brand.price_max')
  if (retail !== null && ((typeof low === 'number' && retail < low) || (typeof high === 'number' && retail > high))) return null
  const margin = retail !== null && typeof cost === 'number' ? (retail - cost) / retail * 100 : null
  const target = m('strategy.target_margin')
  if (margin !== null && typeof target === 'number' && margin < target) return null
  if (margin === null) unknowns.push('Margin requires a confirmed supply cost and a merchant retail price.')
  if (retail === null) unknowns.push('Suggested retail price is not established.')
  if (low === null || high === null) unknowns.push('Merchant retail price range is incomplete.')
  if (p('fulfillment.warehouse') === null) unknowns.push('Local warehouse availability is unknown.')
  unknowns.push('Returns handling and landed shipping costs require confirmation.')
  risks.push(`Lead time: ${String(p('commercial.lead_time'))}.`, 'Gross margin excludes freight, duties, platform fees and returns.')
  return {
    explanation: {
      category: `${String(p('identity.category'))} matches preferred categories: ${String(m('strategy.preferred_categories'))}.`,
      audience: `Targets ${opportunity.targetCustomerTypes.join(', ')}; your audience: ${String(m('brand.audience'))}.`,
      price: retail === null ? 'Retail price requires a test hypothesis.' : `Suggested ${retail} ${opportunity.currency}; this is a test hypothesis, not a verified selling price.`,
      margin: margin === null ? 'Supply cost or retail price is unknown.' : `Product-cost-only margin estimate: ${margin.toFixed(1)}%.`,
      moq: `MOQ ${moq}; your maximum ${tolerance}.`,
      brandability: `Private label: ${String(p('customization.private_label'))}.`,
      fulfillment: `Supplier shipping: ${String(p('fulfillment.shipping'))}. Validate compatibility with ${String(m('commerce.fulfillment_model') ?? 'your fulfillment model')}.`,
      content: `Use case: ${String(p('positioning.use_cases') ?? 'requires confirmation')}; use supplier-approved product images.`,
    }, risks, unknowns,
  }
}
