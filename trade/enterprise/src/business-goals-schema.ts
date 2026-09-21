/** Business objectives belong to the enterprise, independently of Harness Session goals. */
import { z } from 'zod'

/** Stable identity for a business objective shared by its tasks. */
export const businessGoalId = z.string().uuid().brand<'BusinessGoalId'>()
/** User-owned success criteria and outcome; an owner is a display label. */
export const businessGoalFields = z.object({
  title: z.string().trim().min(1).max(240),
  successCriteria: z.string().trim().min(1).max(3000),
  owner: z.string().trim().max(160),
  dueDate: z.iso.date().nullable(),
  status: z.enum(['active', 'paused', 'achieved']),
  outcome: z.string().trim().max(5000),
}).strict().refine(value => value.status !== 'achieved' || value.outcome.length > 0, { path: ['outcome'], message: 'An achieved goal requires a recorded outcome.' })
/** Persisted objective with optimistic concurrency and reversible archival. */
export const businessGoalSchema = businessGoalFields.safeExtend({
  id: businessGoalId,
  revision: z.number().int().positive(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
/** Business objective returned to the workspace. */
export type BusinessGoal = z.infer<typeof businessGoalSchema>
/** Complete editable fields submitted by the goal editor. */
export type BusinessGoalFields = z.infer<typeof businessGoalFields>
/** Every update and archive command names the version reviewed by the user. */
export const businessGoalCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id: businessGoalId, fields: businessGoalFields }).strict(),
  z.object({ action: z.literal('update'), id: businessGoalId, expectedRevision: z.number().int().positive(), fields: businessGoalFields }).strict(),
  z.object({ action: z.literal('archive'), id: businessGoalId, expectedRevision: z.number().int().positive(), archived: z.boolean() }).strict(),
])
/** Validated human command; models only read business goals. */
export type BusinessGoalCommand = z.infer<typeof businessGoalCommand>
