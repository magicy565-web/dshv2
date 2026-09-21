/** Enterprise task records are independent of agent Session plans. */
import { z } from 'zod'
import { businessGoalId } from './business-goals-schema.ts'

/** Stable identity of an enterprise-owned task. */
export const taskId = z.string().uuid().brand<'EnterpriseTaskId'>()
/** Editable fields; an assignee is a label, not an authenticated identity. */
export const taskFields = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(5000),
  assignee: z.string().trim().max(160),
  dueDate: z.iso.date().nullable(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
  goalId: businessGoalId.nullable(),
  outcome: z.string().trim().max(5000),
}).strict().refine(value => value.status !== 'done' || value.goalId === null || value.outcome.length > 0, { path: ['outcome'], message: 'A completed goal task requires an outcome.' })
/** Persisted task with optimistic concurrency and reversible archival. */
export const taskSchema = taskFields.safeExtend({
  id: taskId,
  revision: z.number().int().positive(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
/** Task returned to the browser. */
export type EnterpriseTask = z.infer<typeof taskSchema>
/** Validated task editor input. */
export type TaskFields = z.infer<typeof taskFields>
/** Explicit commands reject stale updates instead of overwriting newer work. */
export const taskCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id: taskId, fields: taskFields }).strict(),
  z.object({ action: z.literal('update'), id: taskId, expectedRevision: z.number().int().positive(), fields: taskFields }).strict(),
  z.object({ action: z.literal('archive'), id: taskId, expectedRevision: z.number().int().positive(), archived: z.boolean() }).strict(),
])
/** Task command accepted by the server. */
export type TaskCommand = z.infer<typeof taskCommand>
/** An activity record retains the complete committed task revision. */
export const taskActivitySchema = z.object({
  action: z.enum(['create', 'update', 'archive']),
  actor: z.literal('shared_host'),
  task: taskSchema,
})
/** Revision history response, oldest first. */
export const taskHistorySchema = z.array(taskActivitySchema)
