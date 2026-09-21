import { randomUUID } from 'node:crypto'
import { ShopifyApiError, type ShopifyStoreService, type ShopifyThemeId } from '@deepseek-ai/dsh-shopify'
import { renderShopifyThemeFiles } from '@deepseek-ai/dsh-site'
import type { SiteService, SiteSpec } from '@deepseek-ai/dsh-site'
import type { PublishJob, PublishJobId, SiteRevision } from '@deepseek-ai/dsh-site'
import type { PublishAttempt, PublishAuditEvent } from './types.ts'
import { PublishAttemptId } from './types.ts'

export * from './types.ts'

/** Retry limits and the explicitly reviewed Shopify theme. */
export interface PublishWorkflowOptions {
  readonly maxAttempts?: number
  readonly retryDelayMs?: number
  readonly onAudit?: (event: PublishAuditEvent) => void
  /** Explicit theme selected during preview and approval. */
  readonly themeId: ShopifyThemeId
}

/** Coordinates one site revision publication through the resolved Shopify provider. */
export class SitePublishWorkflow {
  private readonly attempts = new Map<PublishJobId, PublishAttempt[]>()
  constructor(
    private readonly sites: SiteService,
    private readonly shopify: ShopifyStoreService,
    private readonly options: PublishWorkflowOptions,
  ) {
    if (!Number.isSafeInteger(options.maxAttempts ?? 3) || (options.maxAttempts ?? 3) < 1) throw new Error('maxAttempts must be a positive safe integer')
    if (!Number.isFinite(options.retryDelayMs ?? 0) || (options.retryDelayMs ?? 0) < 0) throw new Error('retryDelayMs must be finite and nonnegative')
    if (!options.themeId.trim()) throw new Error('themeId is required')
  }

  /** Publish a revision with bounded retries and a stable request identity.
   * @param spec - Authorized tenant and site.
   * @param revision - Immutable stored revision selected for publication.
   * @param job - Queued job owned by that revision.
   * @returns Settled durable job; uncertain provider writes remain failed for reconciliation.
   */
  async run(spec: SiteSpec, revision: SiteRevision, job: PublishJob): Promise<PublishJob> {
    if (job.siteId !== spec.siteId) throw new Error(`publication job '${job.id}' belongs to a different site`)
    if (job.revisionId !== revision.id) throw new Error(`publication job '${job.id}' targets a different revision`)
    if (revision.siteId !== spec.siteId) throw new Error('revision belongs to a different site')
    const stored = this.sites.getRevision(spec, revision.id)
    if (!stored || JSON.stringify(stored) !== JSON.stringify(revision)) throw new Error('revision does not match stored site state')
    if (job.status !== 'queued') {
      throw new Error(`publication job '${job.id}' is not queued (status: ${job.status})`)
    }
    const key = `${job.id}:${revision.id}`
    const result = await this.sites.runPublishJob(spec, job.id, async (site, storedRevision) => {
      if (!site.connectionId) throw new Error('Shopify publication requires a connected store')
      const connection = this.shopify.getConnection(site.connectionId)
      if (!connection || connection.tenantId !== spec.tenantId) throw new Error('store connection is not available for this tenant')
      const storeSpec = this.shopify.resolve({ tenantId: spec.tenantId, connectionId: site.connectionId, mode: connection.mode })
      const provider = this.shopify.provider(storeSpec)
      const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3)
      for (let number = 1; number <= maxAttempts; number += 1) {
        const attempt: PublishAttempt = {
          id: PublishAttemptId(randomUUID()), jobId: job.id, siteId: site.id,
          revisionId: storedRevision.id, connectionId: site.connectionId, number,
          status: 'running', startedAt: new Date().toISOString(),
        }
        this.record(job.id, attempt)
        this.sites.recordPublishAttempt(spec, job.id, { number, startedAt: attempt.startedAt, status: 'running' })
        try {
          const themes = await provider.listThemes(storeSpec)
          const theme = themes.find(item => item.id === this.options.themeId)
          if (!theme || theme.role !== 'unpublished') throw new Error('Shopify store has no writable unpublished theme')
          const resolved = { ...storedRevision, changeSet: this.sites.content(spec, storedRevision.id) }
          await provider.publish(storeSpec, {
            connectionId: site.connectionId, themeId: theme.id, files: renderShopifyThemeFiles(site, resolved), idempotencyKey: key,
          })
        } catch (error) {
          const failed = {
            ...attempt, status: 'failed' as const, finishedAt: new Date().toISOString(), error: String(error),
          }
          this.replace(job.id, failed)
          this.sites.recordPublishAttempt(spec, job.id, { number, startedAt: failed.startedAt, finishedAt: failed.finishedAt, status: 'failed', error: failed.error })
          this.audit(failed)
          const retryable = error instanceof ShopifyApiError && (error.kind === 'transient' || error.kind === 'rate-limit')
          if (!retryable) break
          if (number < maxAttempts) {
            const delayMs = this.options.retryDelayMs ?? 0
            if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
            continue
          }
          throw error
        }
        const done = { ...attempt, status: 'succeeded' as const, finishedAt: new Date().toISOString() }
        this.replace(job.id, done)
        this.sites.recordPublishAttempt(spec, job.id, { number, startedAt: done.startedAt, finishedAt: done.finishedAt, status: 'succeeded' })
        return
      }
      throw new Error('publication failed')
    })
    if (result.status === 'succeeded') {
      const done = this.attempts.get(job.id)?.at(-1)
      if (done?.status === 'succeeded') this.audit(done)
    }
    return result
  }

  /** Return the audit details captured by this workflow instance.
   * @param jobId - Job whose audit attempts are requested.
   * @returns Detached process-local audit records; durable attempt status belongs to the Site job.
   */
  history(jobId: PublishJobId): readonly PublishAttempt[] { return structuredClone(this.attempts.get(jobId) ?? []) }
  private record(jobId: PublishJobId, attempt: PublishAttempt): void {
    const list = this.attempts.get(jobId) ?? []
    list.push(attempt)
    this.attempts.set(jobId, list)
  }
  private replace(jobId: PublishJobId, attempt: PublishAttempt): void {
    const list = this.attempts.get(jobId) ?? []
    const index = list.findIndex(item => item.id === attempt.id)
    if (index >= 0) list[index] = attempt
  }
  private audit(attempt: PublishAttempt): void {
    this.options.onAudit?.({
      jobId: attempt.jobId, attemptId: attempt.id, siteId: attempt.siteId, connectionId: attempt.connectionId,
      status: attempt.status, at: attempt.finishedAt ?? attempt.startedAt,
    })
  }
}

export default SitePublishWorkflow
