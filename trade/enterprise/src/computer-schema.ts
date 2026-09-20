/** Validated enterprise computer records shared by Host and browser. */
import { z } from 'zod'
import { fileId } from './schema.ts'
import { taskId } from './tasks-schema.ts'

/** Identity of a bound external computer and its single worker. */
export const computerId = z.string().uuid().brand<'ComputerId'>()
/** Identity of one explicitly authorized computer job. */
export const computerJobId = z.string().uuid().brand<'ComputerJobId'>()
/** Binding input contains identifiers, never vendor credentials. */
export const computerFields = z.object({
  name: z.string().trim().min(1).max(160),
  account: z.string().trim().min(1).max(160),
  worker: z.string().trim().min(1).max(160),
  nativeUrl: z.url().max(2000).refine(value => { if (!URL.canParse(value)) return false; const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash }),
  instructions: z.string().trim().min(1).max(5000),
}).strict()
/** Persisted binding; activity does not establish machine health. */
export const computerBinding = computerFields.extend({ id: computerId, provider: z.literal('grokbot'), enabled: z.boolean(), createdAt: z.iso.datetime() })
/** Explicit task disclosure and required deliverables. */
export const computerJobInput = z.object({
  id: computerJobId, computerId,
  objective: z.string().trim().min(1).max(240),
  context: z.string().trim().min(1).max(10000),
  inputFileIds: z.array(fileId).max(50),
  expectedOutputs: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
}).strict()
/** External execution states do not imply provider control capabilities. */
export const computerState = z.enum(['QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'WAITING_HUMAN', 'CANCEL_REQUESTED', 'VERIFYING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED', 'UNKNOWN'])
/** Uploaded deliverables reference actual enterprise assets. */
export const computerArtifact = z.object({ fileId, output: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/), name: z.string(), size: z.number().int().positive() })
/** Durable job with an immutable context package and optimistic revision. */
export const computerJob = computerJobInput.extend({
  taskId, revision: z.number().int().positive(), state: computerState,
  instructions: z.string(), contextVersion: z.string(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), lastProgressAt: z.iso.datetime().nullable(),
  progress: z.string(), result: z.string(), artifacts: z.array(computerArtifact),
  approvalTaskId: taskId.nullable(), approvalAction: z.string(),
})
/** Browser command input; only humans can accept a result. */
export const computerCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('bind'), fields: computerFields }).strict(),
  z.object({ action: z.literal('rotate'), id: computerId }).strict(),
  z.object({ action: z.literal('disconnect'), id: computerId }).strict(),
  z.object({ action: z.literal('create'), job: computerJobInput }).strict(),
  z.object({ action: z.enum(['cancel', 'unknown', 'review']), id: computerJobId, expectedRevision: z.number().int().positive(), verdict: z.enum(['SUCCEEDED', 'PARTIAL', 'FAILED']).optional(), comment: z.string().trim().min(1).max(2000) }).strict(),
])
/** Worker callbacks cannot assign final success or change disclosure. */
export const computerReport = z.object({
  id: computerJobId, expectedRevision: z.number().int().positive(),
  action: z.enum(['progress', 'request_approval', 'submit_result', 'confirm_stop', 'fail']),
  message: z.string().trim().min(1).max(5000),
  waitingHuman: z.boolean().optional(),
}).strict()
/** Public binding type omits the connector credential digest. */
export type ComputerBinding = z.infer<typeof computerBinding>
/** Durable computer job returned through authenticated routes. */
export type ComputerJob = z.infer<typeof computerJob>
/** Workspace computer snapshot, including the reusable enterprise file picker. */
export const computerSnapshot = z.object({
  bindings: z.array(computerBinding), jobs: z.array(computerJob),
  files: z.array(z.object({ id: fileId, name: z.string() })),
  approvals: z.array(z.object({ id: z.string(), status: z.string(), revision: z.number() })),
})
