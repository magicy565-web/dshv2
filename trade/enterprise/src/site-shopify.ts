/** Human-reviewed Shopify jobs execute serially with durable attempts and exact revision rendering. */
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import type { SiteService, SiteSpec, SitePublishTarget } from '../../../packages/site/site/src/index.ts'
import { renderShopifyThemeFiles } from '../../../packages/site/site/src/shopify-publisher.ts'
import type { SiteRevisionId } from '../../../packages/site/site/src/types.ts'
import type { ShopifyStoreProvider } from '../../../packages/shopify/shopify/src/service.ts'
import type { ShopifyStoreSpec, StoreConnectionId, ShopifyThemeId } from '../../../packages/shopify/shopify/src/types.ts'
import { ShopifyApiError } from '../../../packages/shopify/shopify/src/client.ts'
import { SiteHostingError } from './site-hosting.ts'

/** Deployment limits for theme operations and the publication worker. */
export const siteShopifyConfig = z.object({ requestTimeoutMs: z.number().int().positive().default(30000), pollIntervalMs: z.number().int().positive().default(1000), maxPollAttempts: z.number().int().positive().default(60), maxAttempts: z.number().int().positive().default(3), retryDelayMs: z.number().int().nonnegative().default(1000), maxJobsPerTick: z.number().int().positive().default(5) }).strict()

/** Authorization and credentials remain owned by the enterprise Host. */
export interface SiteShopifyAccess {
  /** List available connections without their credentials.
   * @returns Tenant-owned store names and opaque connection identities.
   */
  connections(): readonly { id: StoreConnectionId; name: string }[]
  /** Revalidate access and supply an authorized provider for one request.
   * @param connectionId - Connection selected in the reviewed publication.
   * @param signal - Request or Host cancellation.
   * @returns Authorized provider and explicitly resolved store access.
   */
  resolve(connectionId: StoreConnectionId, signal: AbortSignal): { provider: ShopifyStoreProvider; spec: ShopifyStoreSpec }
}

/** Publication consumes a persisted destination instead of mutable deployment settings. */
export class SiteShopifyWorker {
  constructor(private readonly sites: SiteService, private readonly access: SiteShopifyAccess, private readonly config: z.infer<typeof siteShopifyConfig>) {}
  /** Read authorized store names and optionally their remote themes.
   * @param connectionId - Optional selected connection.
   * @param signal - Request cancellation.
   * @returns Credential-free choices for human review.
   */
  async options(connectionId: StoreConnectionId | undefined, signal: AbortSignal) {
    const connections = this.access.connections()
    if (!connectionId) return { connections, themes: [] }
    const { provider, spec } = this.access.resolve(connectionId, signal)
    return { connections, themes: await provider.listThemes(spec) }
  }
  private rendered(spec: SiteSpec, revisionId: SiteRevisionId) {
    const site = this.sites.get(spec)
    const revision = this.sites.getRevision(spec, revisionId)
    if (!site || !revision) throw new SiteHostingError(404, 'Site revision not found')
    if (site.archived) throw new SiteHostingError(409, 'Restore the archived site before publication')
    const content = this.sites.content(spec, revisionId)
    if (content.project || !content.pages.some(page => page.kind === 'home')) throw new SiteHostingError(422, 'Shopify requires controlled pages including a home template; source projects use local or cloud hosting')
    return renderShopifyThemeFiles(site, { ...revision, changeSet: content })
  }
  private digest(spec: SiteSpec, revisionId: SiteRevisionId, connectionId: StoreConnectionId, themeId: ShopifyThemeId) {
    const files = this.rendered(spec, revisionId)
    return { files, digest: createHash('sha256').update(JSON.stringify({ revisionId, connectionId, themeId, files })).digest('hex') }
  }
  /** Bind confirmation to stored source and a writable unpublished theme.
   * @param spec - Authorized website.
   * @param revisionId - Saved revision selected for review.
   * @param target - Selected store and theme.
   * @param signal - Request cancellation.
   * @returns Rendered files, affected templates and their immutable review digest.
   */
  async review(spec: SiteSpec, revisionId: SiteRevisionId, target: Pick<SitePublishTarget, 'connectionId' | 'themeId'>, signal: AbortSignal) {
    const result = this.digest(spec, revisionId, target.connectionId, target.themeId)
    const { provider, spec: store } = this.access.resolve(target.connectionId, signal)
    const theme = (await provider.listThemes(store)).find(item => item.id === target.themeId)
    if (!theme || theme.role !== 'unpublished') throw new SiteHostingError(409, 'Select an unpublished theme to preserve the current live store on failure')
    return { revisionId, ...target, ...result, themeName: theme.name }
  }
  /** Queue only the exact revision and destination the user reviewed.
   * @param spec - Authorized site.
   * @param revisionId - Immutable source revision.
   * @param target - Human-reviewed destination and digest.
   * @param expectedRevisionId - Draft observed when confirmation was given.
   * @param signal - Request cancellation.
   * @returns Committed queued job; no publication occurs here.
   */
  async queue(spec: SiteSpec, revisionId: SiteRevisionId, target: SitePublishTarget, expectedRevisionId: SiteRevisionId, signal: AbortSignal) {
    const reviewed = await this.review(spec, revisionId, target, signal)
    if (reviewed.digest !== target.digest || this.sites.get(spec)?.currentRevisionId !== expectedRevisionId) throw new SiteHostingError(409, 'Publication review changed; review again')
    signal.throwIfAborted()
    return this.sites.queuePublishJob(spec, revisionId, target)
  }
  /** Drain queued jobs with bounded retries; a restarted running job is never automatically resubmitted.
   * @param specs - Authorized sites in this deployment.
   * @param signal - Host shutdown cancellation.
   */
  async tick(specs: readonly SiteSpec[], signal: AbortSignal): Promise<void> {
    let remaining = this.config.maxJobsPerTick
    for (const spec of specs) for (const job of [...this.sites.listPublishJobs(spec)].reverse()) {
      if (job.status !== 'queued' || !job.target || remaining-- <= 0) continue
      signal.throwIfAborted()
      const target = job.target
      await this.sites.runPublishJob(spec, job.id, async () => {
        const rendered = this.digest(spec, job.revisionId, target.connectionId, target.themeId)
        if (rendered.digest !== target.digest) throw new Error('Approved Shopify files do not match the queued digest')
        for (let number = 1; number <= this.config.maxAttempts; number++) {
          signal.throwIfAborted()
          const startedAt = new Date().toISOString()
          this.sites.recordPublishAttempt(spec, job.id, { number, startedAt, status: 'running' })
          try {
            const { provider, spec: store } = this.access.resolve(target.connectionId, signal)
            const theme = (await provider.listThemes(store)).find(item => item.id === target.themeId)
            if (!theme || theme.role !== 'unpublished') throw new Error('The approved theme is no longer unpublished; reconcile provider state before retrying')
            await provider.publish(store, { connectionId: store.connectionId, themeId: target.themeId, files: rendered.files, idempotencyKey: `site-revision:${job.revisionId}:${target.digest}` })
            this.sites.recordPublishAttempt(spec, job.id, { number, startedAt, status: 'succeeded', finishedAt: new Date().toISOString() })
            return
          } catch (error) {
            this.sites.recordPublishAttempt(spec, job.id, { number, startedAt, status: 'failed', finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Shopify publication failed' })
            if (signal.aborted || number === this.config.maxAttempts || !(error instanceof ShopifyApiError) || !['rate-limit', 'transient'].includes(error.kind)) throw error
            await delay(this.config.retryDelayMs, undefined, { signal })
          }
        }
      })
    }
  }
}
