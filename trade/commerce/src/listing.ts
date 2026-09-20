/** Small launch kit derived from canonical facts and the merchant profile. */
import { base } from './database.ts'
import { value } from './matching.ts'
import type { Fact, Records } from './schema.ts'

/** Derive sales copy and ten bounded assets without inventing specifications.
 * @param launch - Merchant's test intent.
 * @param facts - Only supported public Passport facts.
 * @param profile - Only supported Merchant facts.
 * @param now - Operation time.
 * @returns Listing and asset drafts; graphic entries are briefs, not generated images.
 */
export function launchKit(launch: Records['launch'], facts: Record<string, Fact>, profile: Record<string, Fact>, now: string) {
  const title = String(value(facts, 'identity.product_name'))
  const audience = String(value(profile, 'brand.audience') ?? 'customers')
  const language = String(value(profile, 'brand.language') ?? 'en')
  const tone = String(value(profile, 'brand.tone') ?? 'clear and factual')
  const specs = Object.fromEntries(Object.entries(facts).filter(([key]) => key.startsWith('specifications.')).map(([key, f]) => [key, f.value]))
  const sourceFacts = Object.keys(facts)
  const evidenceIds = [...new Set(Object.values(facts).flatMap(f => f.evidenceIds))]
  const shared = { merchantId: launch.merchantId, productId: launch.productId, launchId: launch.id, passportRevision: launch.passportRevision, sourceFacts, evidenceIds }
  const rawImages = value(facts, 'evidence.product_images')
  const images = Array.isArray(rawImages) ? rawImages : []
  const use = String(value(facts, 'positioning.use_cases') ?? value(facts, 'specifications.applications') ?? title)
  const description = `${title}\n${use}\n${Object.entries(specs).map(([k, v]) => `${k}: ${String(v)}`).join('\n')}`
  const rawVariants = value(facts, 'specifications.variants')
  const listing: Records['listing'] = {
    ...base(now), ...shared, profileRevision: launch.profileRevision, title, description,
    benefits: [use], specifications: specs, variants: Array.isArray(rawVariants) && rawVariants.length ? rawVariants : ['Default'],
    faq: [`Specifications: ${String(value(facts, 'specifications.technical_specs'))}`],
    seo: { title, description: use }, collections: [String(value(facts, 'identity.category'))], tags: [String(value(facts, 'identity.category'))], images, status: 'PREPARED', operation: 'IDLE',
  }
  const plans: [Records['artifact']['kind'], string][] = [
    ['HERO_BRIEF', `Use the approved image of ${title}. Audience: ${audience}. Tone: ${tone}. Do not fabricate product photography.`],
    ['DETAIL_BRIEF', `Show approved details: ${String(value(facts, 'specifications.technical_specs'))}.`],
    ...[1, 2, 3].map(n => ['SOCIAL_POST', `${n}. ${title} — ${use}`] as [Records['artifact']['kind'], string]),
    ...['Demonstration', 'Close-up', 'Use case'].map(s => ['SHORT_FORM_CONCEPT', `${s}: ${title}. ${use}`] as [Records['artifact']['kind'], string]),
    ['ANNOUNCEMENT', `${title}\nFor ${audience}\n${use}`], ['PRODUCT_STORY', description],
  ]
  return { listing, artifacts: plans.map(([kind, content]): Records['artifact'] => ({ ...base(now), ...shared, kind, content, language, createdBy: 'Commerce Workbuddy', })) }
}
