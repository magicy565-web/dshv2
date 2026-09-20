/** Wire schemas for business facts, commands and durable commerce records. */
import { z } from 'zod'

/** UUIDs are opaque across the API and database. */
export const id = z.uuid().brand<'CommerceId'>()
/** Opaque business identity. */
export type Id = z.infer<typeof id>
/** Commerce Workbuddy capabilities exposed to Web and external plugins. */
export const skills = ['company.intake', 'product.extract', 'product.complete', 'opportunity.build', 'merchant.understand', 'opportunity.match', 'sample.request', 'listing.generate', 'artifact.generate', 'launch.prepare', 'performance.review'] as const
const text = z.string().trim().min(1).max(4000)
const short = z.string().trim().min(1).max(200)
const url = z.url({ protocol: /^https?$/ }).refine(v => !new URL(v).username && !new URL(v).password)
/** Trust and disclosure are independent dimensions. */
export const fact = z.object({
  value: z.union([text, z.number().finite(), z.boolean(), z.array(short).max(50), z.null()]),
  status: z.enum(['VERIFIED', 'DOCUMENT_SUPPORTED', 'USER_CONFIRMED', 'AI_INFERRED', 'UNKNOWN', 'CONFLICTING']),
  visibility: z.enum(['PUBLIC', 'CONFIDENTIAL']), evidenceIds: z.array(id).max(30),
}).strict().refine(v => v.status === 'UNKNOWN' ? v.value === null : v.value !== null, 'UNKNOWN must have a null value')
/** Sourced value in a Company, Passport or Merchant profile. */
export type Fact = z.infer<typeof fact>
/** Company attributes supported by intake. */
export const companyFields = ['legal_name', 'display_name', 'company_type', 'website', 'country', 'region', 'factory_status', 'capabilities', 'certifications', 'export_markets', 'oem', 'odm', 'commercial_policies', 'contacts', 'public_profile'] as const
/** Canonical product fields; missing fields remain UNKNOWN in readiness output. */
export const productFields = [
  'identity.product_name', 'identity.category', 'identity.sku', 'identity.manufacturer', 'identity.brand',
  'specifications.materials', 'specifications.dimensions', 'specifications.variants', 'specifications.technical_specs', 'specifications.applications',
  'commercial.cost', 'commercial.currency', 'commercial.price_basis', 'commercial.moq', 'commercial.sample', 'commercial.lead_time', 'commercial.payment_terms', 'commercial.inventory', 'commercial.capacity',
  'customization.private_label', 'customization.oem', 'customization.odm', 'customization.packaging', 'customization.colors', 'customization.materials', 'customization.design',
  'fulfillment.origin', 'fulfillment.shipping', 'fulfillment.warehouse', 'fulfillment.delivery_estimate',
  'positioning.use_cases', 'positioning.target_customer', 'positioning.price_band', 'positioning.differentiators',
  'evidence.product_images', 'evidence.product_documents', 'evidence.certifications', 'evidence.test_reports', 'evidence.factory_evidence',
] as const
/** Merchant facts used by explainable filtering and listing composition. */
export const merchantFields = ['name', 'market', 'channels', 'brand.positioning', 'brand.audience', 'brand.aesthetic', 'brand.tone', 'brand.language', 'brand.price_min', 'brand.price_max', 'catalog.current_categories', 'catalog.current_products', 'catalog.average_price', 'catalog.gaps', 'customers.target_customer', 'customers.geography', 'customers.use_cases', 'commerce.shopify', 'commerce.order_volume', 'commerce.fulfillment_model', 'strategy.growth_goal', 'strategy.preferred_categories', 'strategy.max_moq', 'strategy.target_margin', 'strategy.currency', 'strategy.private_label'] as const
/** Fact map accepted by product extraction. */
export const passportFacts = z.partialRecord(z.enum(productFields), fact)
/** Company intake map. */
export const companyFacts = z.partialRecord(z.enum(companyFields), fact)
/** Merchant intake map. */
export const merchantFacts = z.partialRecord(z.enum(merchantFields), fact)
const base = { id, revision: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }
const company = z.object({ ...base, facts: companyFacts }).strict()
const product = z.object({ ...base, companyId: id, paused: z.boolean() }).strict()
const passport = z.object({ ...base, companyId: id, productId: id, facts: passportFacts }).strict()
const evidence = z.object({
  ...base, ownerId: id, entityType: z.enum(['company', 'passport', 'merchantProfile']), entityId: id,
  field: short, value: fact.shape.value, sourceType: z.enum(['WEBSITE', 'DOCUMENT', 'USER', 'AGENT']),
  sourceUrl: url.nullable(), sourceFile: short.nullable(), sourceUser: short.nullable(), sourceAgent: short.nullable(),
  excerpt: text, verificationStatus: fact.shape.status, confidence: z.number().min(0).max(1).nullable(),
  capturedAt: z.iso.datetime(), validUntil: z.iso.datetime().nullable(), revoked: z.boolean(),
}).strict()
const opportunity = z.object({
  ...base, companyId: id, productId: id, passportRevision: z.number().int().positive(), companyRevision: z.number().int().positive(),
  targetMarket: short, targetBrandTypes: z.array(short).min(1).max(20), targetCustomerTypes: z.array(short).min(1).max(20),
  suggestedRetailPrice: z.number().positive().nullable(), currency: z.string().regex(/^[A-Z]{3}$/),
  launchRequirements: z.array(short).max(20), status: z.enum(['DRAFT', 'AVAILABLE', 'PAUSED']),
}).strict()
const merchant = z.object({ ...base, name: short }).strict()
const merchantProfile = z.object({ ...base, merchantId: id, facts: merchantFacts }).strict()
const explanation = z.object({ category: text, audience: text, price: text, margin: text, moq: text, brandability: text, fulfillment: text, content: text }).strict()
const match = z.object({
  ...base, merchantId: id, opportunityId: id, opportunityRevision: z.number().int().positive(), profileRevision: z.number().int().positive(),
  explanation, risks: z.array(text), unknowns: z.array(text),
  feedback: z.enum(['NONE', 'SAVED', 'NOT_INTERESTED']),
  reason: z.enum(['wrong_category', 'wrong_margin', 'high_moq', 'wrong_audience', 'bad_design', 'long_lead_time', 'other']).nullable(),
}).strict()
const sample = z.object({
  ...base, merchantId: id, companyId: id, productId: id, opportunityId: id, matchId: id,
  variant: short, shippingAddress: text, sampleCost: z.number().nonnegative().nullable(), shippingCost: z.number().nonnegative().nullable(), currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['REQUESTED', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'ACCEPTED', 'REJECTED', 'CANCELLED']), supplierResponse: z.string().max(4000), tracking: z.string().max(1000),
}).strict()
const launch = z.object({
  ...base, merchantId: id, productId: id, opportunityId: id, sampleId: id, passportRevision: z.number().int().positive(), profileRevision: z.number().int().positive(),
  status: z.enum(['PREPARING', 'READY', 'LIVE', 'PAUSED', 'STOPPED', 'SCALE']), launchDate: z.iso.datetime().nullable(),
  targetPrice: z.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/), unitSupplyCost: z.number().nonnegative().nullable(), targetMargin: z.number().min(0).max(100).nullable(), initialInventoryModel: short,
  shopifyProductId: z.string().nullable(), decision: z.enum(['STOP', 'ITERATE', 'SCALE']).nullable(), decisionEvidenceId: id.nullable(),
}).strict()
const listing = z.object({
  ...base, merchantId: id, productId: id, launchId: id, passportRevision: z.number().int().positive(), profileRevision: z.number().int().positive(),
  title: short, description: text, benefits: z.array(text), specifications: z.record(short, fact.shape.value), variants: z.array(short), faq: z.array(text),
  seo: z.object({ title: short, description: text }), collections: z.array(short), tags: z.array(short), images: z.array(url),
  sourceFacts: z.array(short), evidenceIds: z.array(id), status: z.enum(['PREPARED', 'DRAFT', 'PUBLISHED']), operation: z.enum(['IDLE', 'DRAFTING', 'UNCERTAIN']),
}).strict()
const artifact = z.object({
  ...base, merchantId: id, productId: id, launchId: id, passportRevision: z.number().int().positive(),
  kind: z.enum(['HERO_BRIEF', 'DETAIL_BRIEF', 'SOCIAL_POST', 'SHORT_FORM_CONCEPT', 'ANNOUNCEMENT', 'PRODUCT_STORY']),
  content: text, sourceFacts: z.array(short), evidenceIds: z.array(id), language: short, createdBy: short,
}).strict()
const performance = z.object({
  ...base, merchantId: id, launchId: id, source: z.enum(['SHOPIFY', 'MERCHANT_REPORT']), sourceReference: text,
  periodStart: z.iso.datetime(), periodEnd: z.iso.datetime(), currency: z.string().regex(/^[A-Z]{3}$/),
  views: z.number().int().nonnegative().nullable(), addToCart: z.number().int().nonnegative().nullable(),
  orders: z.number().int().nonnegative(), unitsSold: z.number().int().nonnegative(), revenue: z.number().nonnegative(), refunds: z.number().nonnegative(),
  grossMarginEstimate: z.number().nullable(),
}).strict().refine(v => v.periodStart < v.periodEnd && v.refunds <= v.revenue, 'Invalid performance period or refunds')
const approval = z.object({ ...base, merchantId: id, launchId: id, launchRevision: z.number().int().positive(), listingRevision: z.number().int().positive(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXECUTING', 'EXECUTED', 'UNCERTAIN']), action: z.literal('SHOPIFY_PUBLISH') }).strict()
const activity = z.object({ ...base, ownerId: id, actor: short, action: short, targetId: id, detail: z.string().max(4000) }).strict()

/** One table per business entity; Session data never enters these schemas. */
export const schemas = { company, product, passport, evidence, opportunity, merchant, merchantProfile, match, sample, listing, artifact, launch, performance, activity, approval } as const
/** Table names accepted by storage. */
export type Kind = keyof typeof schemas
/** Durable types indexed by business entity. */
export type Records = { [K in Kind]: z.infer<(typeof schemas)[K]> }
/** Authenticated caller; role and subject are resolved from server configuration. */
export interface Principal { role: 'factory' | 'factory-agent' | 'merchant' | 'merchant-agent'; subjectId: Id }
const envelope = { requestId: id }
const version = { id, expectedRevision: z.number().int().nonnegative() }
/** Stable command contract shared by Web and onboarding plugins. */
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('company.save'), ...version, facts: companyFacts }).strict(),
  z.object({ ...envelope, type: z.literal('product.save'), ...version, facts: passportFacts }).strict(),
  z.object({ ...envelope, type: z.literal('merchant.save'), ...version, name: short, facts: merchantFacts }).strict(),
  z.object({ ...envelope, type: z.literal('evidence.add'), entityType: evidence.shape.entityType, entityId: id, field: short, value: fact.shape.value, sourceType: evidence.shape.sourceType, sourceUrl: url.nullable(), sourceFile: short.nullable(), excerpt: text, validUntil: z.iso.datetime().nullable() }).strict(),
  z.object({ ...envelope, type: z.literal('evidence.revoke'), ...version }).strict(),
  z.object({ ...envelope, type: z.literal('facts.confirm'), entityType: evidence.shape.entityType, ...version, fields: z.array(short).min(1).max(60), visibility: fact.shape.visibility }).strict(),
  z.object({ ...envelope, type: z.literal('product.pause'), ...version, paused: z.boolean() }).strict(),
  z.object({ ...envelope, type: z.literal('opportunity.build'), productId: id, targetMarket: short, targetBrandTypes: opportunity.shape.targetBrandTypes, targetCustomerTypes: opportunity.shape.targetCustomerTypes, suggestedRetailPrice: opportunity.shape.suggestedRetailPrice, currency: opportunity.shape.currency, launchRequirements: opportunity.shape.launchRequirements }).strict(),
  z.object({ ...envelope, type: z.literal('opportunity.release'), ...version, available: z.boolean() }).strict(),
  z.object({ ...envelope, type: z.literal('match.run') }).strict(),
  z.object({ ...envelope, type: z.literal('match.feedback'), ...version, feedback: z.enum(['SAVED', 'NOT_INTERESTED']), reason: match.shape.reason }).strict(),
  z.object({ ...envelope, type: z.literal('sample.request'), matchId: id, variant: short, shippingAddress: text }).strict(),
  z.object({ ...envelope, type: z.literal('sample.transition'), ...version, status: sample.shape.status, sampleCost: sample.shape.sampleCost, shippingCost: sample.shape.shippingCost, supplierResponse: sample.shape.supplierResponse, tracking: sample.shape.tracking }).strict(),
  z.object({ ...envelope, type: z.literal('launch.prepare'), sampleId: id, targetPrice: launch.shape.targetPrice, targetMargin: launch.shape.targetMargin, initialInventoryModel: short }).strict(),
  z.object({ ...envelope, type: z.literal('launch.decision'), ...version, decision: z.enum(['STOP', 'ITERATE', 'SCALE']), performanceId: id }).strict(),
  z.object({ ...envelope, type: z.literal('approval.request'), launchId: id, expectedRevision: z.number().int().positive() }).strict(),
  z.object({ ...envelope, type: z.literal('approval.decide'), ...version, approve: z.boolean() }).strict(),
  z.object({ ...envelope, type: z.literal('performance.record'), launchId: id, sourceReference: text, periodStart: z.iso.datetime(), periodEnd: z.iso.datetime(), currency: performance.shape.currency, views: performance.shape.views, addToCart: performance.shape.addToCart, orders: performance.shape.orders, unitsSold: performance.shape.unitsSold, revenue: performance.shape.revenue, refunds: performance.shape.refunds }).strict(),
])
/** Parsed business command. */
export type Command = z.infer<typeof commandSchema>
