/** Validated overseas-buyer opportunities shared by tools, storage, and the browser. */
import { z } from 'zod'

/** Stable identity of an enterprise-owned opportunity. */
export const opportunityId = z.string().uuid().brand<'EnterpriseOpportunityId'>()
/** Commercial progress controlled by the enterprise workspace. */
export const opportunityStatus = z.enum(['lead', 'researching', 'qualified', 'contacted', 'negotiating', 'won', 'lost'])
/** One research observation retained with its source and observation time. */
export const opportunityEvidence = z.object({
  label: z.string().trim().min(1).max(240),
  uri: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
  note: z.string().trim().min(1).max(2000),
  observedAt: z.iso.datetime(),
}).strict()
/** Editable buyer and opportunity facts. Unknown contact details remain empty. */
export const opportunityFields = z.object({
  buyerName: z.string().trim().min(1).max(240),
  buyerWebsite: z.union([z.literal(''), z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol))]),
  country: z.string().trim().min(1).max(120),
  targetProduct: z.string().trim().min(1).max(500),
  contactName: z.string().trim().max(160),
  contactRole: z.string().trim().max(160),
  contactEmail: z.union([z.literal(''), z.email()]),
  summary: z.string().trim().min(1).max(5000),
  matchScore: z.number().int().min(0).max(100),
  matchRationale: z.string().trim().min(1).max(3000),
  procurementSignals: z.array(z.string().trim().min(1).max(500)).max(20),
  evidence: z.array(opportunityEvidence).max(30),
  status: opportunityStatus,
  nextAction: z.string().trim().max(1000),
  lastContactAt: z.iso.datetime().nullable(),
}).strict().superRefine((value, context) => {
  if (['qualified', 'contacted', 'negotiating', 'won'].includes(value.status) && value.evidence.length === 0) {
    context.addIssue({ code: 'custom', path: ['evidence'], message: 'qualified opportunities require source evidence' })
  }
})
/** Persisted opportunity with optimistic concurrency and reversible archival. */
export const opportunitySchema = opportunityFields.safeExtend({
  id: opportunityId,
  revision: z.number().int().positive(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
/** Opportunity returned to tools and the browser. */
export type EnterpriseOpportunity = z.infer<typeof opportunitySchema>
/** Validated opportunity editor input. */
export type OpportunityFields = z.infer<typeof opportunityFields>
/** Explicit mutations reject stale writes. */
export const opportunityCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id: opportunityId, fields: opportunityFields }).strict(),
  z.object({ action: z.literal('update'), id: opportunityId, expectedRevision: z.number().int().positive(), fields: opportunityFields }).strict(),
  z.object({ action: z.literal('archive'), id: opportunityId, expectedRevision: z.number().int().positive(), archived: z.boolean() }).strict(),
])
/** Opportunity command accepted by the server and Agent tool. */
export type OpportunityCommand = z.infer<typeof opportunityCommand>
