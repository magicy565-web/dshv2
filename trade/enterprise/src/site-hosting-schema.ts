/** Durable deployment records and the replaceable independent hosting provider. */
import { z } from 'zod'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SiteId, SiteRevisionId } from '../../../packages/site/site/src/types.ts'
import { siteDomainName, siteDomainSchema } from './site-domains-schema.ts'

/** Workspace-owned deployment identity, distinct from the provider's deployment id. */
export type SiteDeploymentId = Branded<'SiteDeploymentId'>
/** Provider project identity; never supplied by model tool arguments. */
export type HostingProjectId = Branded<'HostingProjectId'>
/** Provider build identity whose exact bytes are promoted without rebuilding. */
export type HostingBuildId = Branded<'HostingBuildId'>

const hostingUrl = z.string().url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
}, 'Hosting links must use HTTPS without credentials')

/** Validated persisted build metadata; credentials and source files are stored elsewhere. */
export const deploymentSchema = z.object({
  id: z.string().uuid().transform(value => value as SiteDeploymentId),
  revisionId: z.string().uuid().transform(value => value as SiteRevisionId), digest: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  status: z.enum(['submitting', 'building', 'ready', 'failed', 'unknown']),
  buildId: z.string().min(1).transform(value => value as HostingBuildId).optional(),
  previewUrl: hostingUrl.optional(),
  error: z.string().optional(),
  published: z.boolean(),
}).strict()

/** One immutable source version submitted to a remote builder. */
export type SiteDeployment = z.infer<typeof deploymentSchema>

/** Deployment state for one authorized site, with optimistic persistence generation. */
export const hostingStateSchema = z.object({
  siteId: z.string().uuid().transform(value => value as SiteId), generation: z.number().int().nonnegative(),
  projectId: z.string().min(1).transform(value => value as HostingProjectId).optional(),
  deployments: z.array(deploymentSchema),
  liveDeploymentId: z.string().uuid().transform(value => value as SiteDeploymentId).optional(),
  pendingPromotionId: z.string().uuid().transform(value => value as SiteDeploymentId).optional(),
  productionUrl: hostingUrl.optional(),
  availability: z.enum(['unknown', 'online', 'offline']).optional(),
  pendingAvailability: z.object({ paused: z.boolean(), deploymentId: z.string().uuid().transform(value => value as SiteDeploymentId), requestedAt: z.string().datetime() }).strict().optional(),
  operationError: z.string().optional(),
  domains: z.array(siteDomainSchema).optional(),
  pendingDomain: z.object({ operation: z.enum(['add', 'verify', 'remove']), name: siteDomainName, requestedAt: z.string().datetime() }).strict().optional(),
}).strict().superRefine((state, context) => {
  const ids = new Set<string>()
  const builds = new Set<string>()
  for (const deployment of state.deployments) {
    if (ids.has(deployment.id) || (deployment.buildId && builds.has(deployment.buildId))) context.addIssue({ code: 'custom', message: 'Duplicate hosting deployment identity' })
    ids.add(deployment.id)
    if (deployment.buildId) builds.add(deployment.buildId)
    if ((deployment.status === 'building' || deployment.status === 'ready' || deployment.published) && (!state.projectId || !deployment.buildId || !deployment.previewUrl)) context.addIssue({ code: 'custom', message: 'Remote build metadata is missing' })
  }
  if (state.liveDeploymentId && !state.deployments.some(item => item.id === state.liveDeploymentId && item.published)) context.addIssue({ code: 'custom', message: 'Live deployment must reference a published build' })
  if (state.pendingPromotionId && !state.deployments.some(item => item.id === state.pendingPromotionId && item.status === 'ready' && item.buildId)) context.addIssue({ code: 'custom', message: 'Pending publication must reference a ready build' })
  if (state.pendingAvailability && state.pendingAvailability.deploymentId !== state.liveDeploymentId) context.addIssue({ code: 'custom', message: 'Availability changes must reference the current deployment' })
  if (state.pendingDomain && !state.projectId) context.addIssue({ code: 'custom', message: 'Domain operations require a hosting project' })
  if (state.domains && new Set(state.domains.map(domain => domain.name)).size !== state.domains.length) context.addIssue({ code: 'custom', message: 'Duplicate domain name' })
})

/** Persisted hosting state; pending submissions survive process restarts. */
export type SiteHostingState = z.infer<typeof hostingStateSchema>
