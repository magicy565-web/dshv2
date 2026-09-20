/** Private GEO drafts; confirmation is a human review, not publication or certification. */
import { z } from 'zod'
import { geoProduct } from './geo-product.ts'
import { supplierGraph } from './supplier.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const onboardingSessionId = z.string().min(1).max(200).transform(value => value as SessionId)

/** Deployment-local record identifier. */
export const geoId = z.string().uuid().brand<'GeoId'>()
/** Business-specific sections gathered by the onboarding conversation. */
export const geoFields = z.object({
  kind: z.enum(['company', 'product']),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000),
  sections: z.array(z.object({ label: z.string().trim().min(1).max(160), content: z.string().trim().max(3000), source: z.string().trim().max(1000) }).strict()).max(40),
  questions: z.string().trim().max(2000),
  product: geoProduct.optional(),
  supplier: supplierGraph.optional(),
}).strict()
/** Persisted draft and optimistic revision receipt. */
export const geoRecord = geoFields.extend({
  id: geoId, revision: z.number().int().positive(),
  sessionId: z.string().min(1).brand<'GeoSessionId'>(),
  status: z.enum(['draft', 'confirmed']),
  createdBy: z.enum(['user', 'agent']),
  updatedAt: z.iso.datetime(), confirmedAt: z.iso.datetime().nullable(),
  supersedesId: geoId.nullable().default(null),
  productVerifiedAt: z.iso.datetime().optional(),
}).strict()
/** Persisted conversation and user-confirmed catalog scope. */
export const geoProgress = z.object({ sessionId: onboardingSessionId.nullable(), revision: z.number().int().nonnegative(), scopeIds: z.array(geoId), completedAt: z.iso.datetime().nullable() }).strict()
/** Browser compare-and-swap prevents concurrent starts from stealing a conversation. */
export const geoBinding = z.object({ sessionId: onboardingSessionId, expectedRevision: z.number().int().nonnegative() }).strict()
/** Exact records presented when the user finishes the selected onboarding scope. */
export const geoFinish = z.object({ ids: z.array(geoId).min(1).max(100), language: z.enum(['zh', 'en']) }).strict()
/** A review addresses a stored revision; its answer comes from the chat interaction service. */
export const geoReview = z.object({ id: geoId, expectedRevision: z.number().int().positive(), language: z.enum(['zh', 'en']) }).strict()
/** Assistant submissions create or refine drafts, never mutate confirmed records. */
export const geoProposal = z.object({ id: geoId, expectedRevision: z.number().int().nonnegative(), fields: geoFields.extend({ product: geoProduct.omit({ publication: true }).optional() }), supersedesId: geoId.nullable().optional() }).strict()
/** Validated business content collected in chat. */
export type GeoFields = z.infer<typeof geoFields>
/** Durable draft or human-confirmed internal record. */
export type GeoRecord = z.infer<typeof geoRecord>

/**
 * List the fields that prevent human confirmation.
 * @param fields - Current draft content.
 * @returns Missing required fields, including unresolved questions.
 */
export function geoMissing(fields: GeoFields): Array<keyof GeoFields> {
  const missing: Array<keyof GeoFields> = []
  for (const key of ['name', 'description'] as const) if (!fields[key].trim()) missing.push(key)
  if (!fields.sections.length || fields.sections.some(section => !section.content || !section.source)) missing.push('sections')
  if (fields.questions.trim()) missing.push('questions')
  return missing
}
