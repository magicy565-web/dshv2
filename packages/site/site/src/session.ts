/** Whole-value site activity events and their replayable client projection. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SiteStateChange, SitePublishTarget } from './types.ts'

/** Persisted human review destination. */
export const sitePublishTargetSchema: z.ZodType<SitePublishTarget> = z.object({
  connectionId: z.string().min(1), themeId: z.string().regex(/^gid:\/\/shopify\/OnlineStoreTheme\/\d+$/),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().transform(value => value as SitePublishTarget)
/** Attempt diagnostics contain no credentials or source bodies. */
export const sitePublishAttemptSchema = z.object({
  number: z.number().int().positive(), startedAt: z.iso.datetime(), status: z.enum(['running', 'succeeded', 'failed']),
  finishedAt: z.iso.datetime().optional(), error: z.string().optional(),
}).strict()

/** Validate journal records at persistence and projection inputs. */
export const siteStateChangeSchema: z.ZodType<SiteStateChange> = z.object({
  sequence: z.number().int().positive(), time: z.number().int().nonnegative(),
  tenantId: z.string().min(1), siteId: z.string().min(1),
  site: z.object({
    id: z.string().min(1), tenantId: z.string().min(1), name: z.string().min(1), archived: z.boolean().optional(),
    managementVersion: z.number().int().nonnegative().optional(), connectionId: z.string().min(1).optional(),
    currentRevisionId: z.string().min(1).optional(), publishedRevisionId: z.string().min(1).optional(),
  }).strict().nullable(),
  revisions: z.array(z.object({ id: z.string().min(1), createdAt: z.iso.datetime(), source: z.enum(['user', 'agent', 'rollback']) }).strict()),
  jobs: z.array(z.object({ id: z.string().min(1), siteId: z.string().min(1), revisionId: z.string().min(1), status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']), error: z.string().optional(), target: sitePublishTargetSchema.optional(), attempts: z.array(sitePublishAttemptSchema).optional() }).strict()),
}).strict().superRefine((value, ctx) => {
  if (value.site && (value.site.id !== value.siteId || value.site.tenantId !== value.tenantId)) ctx.addIssue({ code: 'custom', message: 'Site journal ownership mismatch' })
  const ids = new Set(value.revisions.map(item => item.id))
  if (ids.size !== value.revisions.length || new Set(value.jobs.map(item => item.id)).size !== value.jobs.length) ctx.addIssue({ code: 'custom', message: 'Duplicate site journal records' })
  if (value.jobs.some(job => job.siteId !== value.siteId || !ids.has(job.revisionId))) ctx.addIssue({ code: 'custom', message: 'Site journal revision mismatch' })
  if ((!value.site && (value.revisions.length || value.jobs.length)) || [value.site?.currentRevisionId, value.site?.publishedRevisionId].some(id => id !== undefined && !ids.has(id))) ctx.addIssue({ code: 'custom', message: 'Invalid site journal references' })
}).transform(value => value as unknown as SiteStateChange)

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Complete committed site metadata; log-only activity, never model context or source authority. */
    'site/state': SiteStateChange
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { site: SiteStateChange | null }
  interface SessionProjectionMap { site: SiteStateChange | null }
}

/** Latest committed website observation in a dedicated site Session. */
export const siteProjection = {
  key: 'site', stateVersion: 1, stateSchema: siteStateChangeSchema.nullable(), init: () => null,
  apply: (state, event) => {
    if (event.type !== 'site/state') return state
    const next = siteStateChangeSchema.parse(event.data)
    if (state && (state.tenantId !== next.tenantId || state.siteId !== next.siteId || next.sequence <= state.sequence)) throw new Error('Site projection ownership or sequence mismatch')
    return next
  },
  wire: { viewSchema: siteStateChangeSchema.nullable(), view: state => state },
} satisfies ProjectionDefinition<'site'>
