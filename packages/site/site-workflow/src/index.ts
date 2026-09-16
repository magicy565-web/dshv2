import { randomUUID } from 'node:crypto'
import { ShopifyApiError, type ShopifyStoreService, type ShopifyThemeId } from '@deepseek-ai/dsh-shopify'
import { renderPageJsonLd, renderRobots, renderSitePage, renderSitemap } from '@deepseek-ai/dsh-site'
import type { SiteService, SiteSpec } from '@deepseek-ai/dsh-site'
import type { PublishJob, PublishJobId, SiteRevision } from '@deepseek-ai/dsh-site'
import type { PublishAttempt, PublishAuditEvent } from './types.ts'
import { PublishAttemptId } from './types.ts'

export * from './types.ts'

export interface PublishWorkflowOptions {
  readonly maxAttempts?: number
  readonly retryDelayMs?: number
  readonly onAudit?: (event: PublishAuditEvent) => void
  /** Public origin used for canonical URLs and sitemap entries. */
  readonly publicOrigin: string
  /** Explicit theme selected during preview and approval. */
  readonly themeId: ShopifyThemeId
}

/** Coordinates one site revision publication through the resolved Shopify provider. */
export class SitePublishWorkflow {
  private readonly attempts = new Map<PublishJobId, PublishAttempt[]>()
  constructor(private readonly sites: SiteService, private readonly shopify: ShopifyStoreService, private readonly options: PublishWorkflowOptions) {
    if (!Number.isSafeInteger(options.maxAttempts ?? 3) || (options.maxAttempts ?? 3) < 1) throw new Error('maxAttempts must be a positive safe integer')
    if (!Number.isFinite(options.retryDelayMs ?? 0) || (options.retryDelayMs ?? 0) < 0) throw new Error('retryDelayMs must be finite and nonnegative')
    if (!options.themeId.trim()) throw new Error('themeId is required')
    const origin = new URL(options.publicOrigin)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('publicOrigin must be an HTTP(S) origin')
  }

  /** Publish a revision with bounded retries and an idempotency key derived from job/revision. */
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
      const connection = this.shopify.getConnection(site.connectionId)
      if (!connection || connection.tenantId !== spec.tenantId) throw new Error('store connection is not available for this tenant')
      const storeSpec = this.shopify.resolve({ tenantId: spec.tenantId, connectionId: site.connectionId, mode: connection.mode })
      const provider = this.shopify.provider(storeSpec)
      const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3)
      for (let number = 1; number <= maxAttempts; number += 1) {
        const attempt: PublishAttempt = { id: PublishAttemptId(randomUUID()), jobId: job.id, siteId: site.id, revisionId: storedRevision.id, connectionId: site.connectionId, number, status: 'running', startedAt: new Date().toISOString() }
        this.record(job.id, attempt)
        try {
          const themes = await provider.listThemes(storeSpec)
          const theme = themes.find(item => item.id === this.options.themeId)
          if (!theme) throw new Error('Shopify store has no writable theme')
          const resolved = { ...storedRevision, changeSet: this.sites.content(spec, storedRevision.id) }
          await provider.publish(storeSpec, { connectionId: site.connectionId, themeId: theme.id, files: this.render(resolved), idempotencyKey: key })
        } catch (error) {
          const failed = { ...attempt, status: 'failed' as const, finishedAt: new Date().toISOString(), error: String(error) }; this.replace(job.id, failed); this.audit(failed)
          const retryable = error instanceof ShopifyApiError && (error.kind === 'transient' || error.kind === 'rate-limit')
          if (!retryable) break
          if (number < maxAttempts && retryable) {
            const delayMs = this.options.retryDelayMs ?? 0
            if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
            continue
          }
          throw error
        }
        const done = { ...attempt, status: 'succeeded' as const, finishedAt: new Date().toISOString() }
        this.replace(job.id, done)
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

  /** Return immutable attempt history for a publication job. */
  history(jobId: PublishJobId): readonly PublishAttempt[] { return structuredClone(this.attempts.get(jobId) ?? []) }
  private render(revision: SiteRevision): Readonly<Record<string, string>> {
    const origin = this.options.publicOrigin
    const files: Record<string, string> = { 'site.revision.json': JSON.stringify(revision.changeSet), 'sitemap.xml': renderSitemap(revision, origin), 'robots.txt': renderRobots(origin) }
    for (const page of revision.changeSet.pages ?? []) {
      const path = page.path === '/' ? 'index.html' : `${page.path.replace(/^\//, '').replace(/\/$/, '')}/index.html`
      files[path] = renderSitePage(revision, page, origin)
      files[path.replace(/\.html$/, '.jsonld')] = renderPageJsonLd(page, origin)
    }
    return files
  }
  private record(jobId: PublishJobId, attempt: PublishAttempt): void { const list = this.attempts.get(jobId) ?? []; list.push(attempt); this.attempts.set(jobId, list) }
  private replace(jobId: PublishJobId, attempt: PublishAttempt): void { const list = this.attempts.get(jobId) ?? []; const index = list.findIndex(item => item.id === attempt.id); if (index >= 0) list[index] = attempt }
  private audit(attempt: PublishAttempt): void { this.options.onAudit?.({ jobId: attempt.jobId, attemptId: attempt.id, siteId: attempt.siteId, connectionId: attempt.connectionId, status: attempt.status, at: attempt.finishedAt ?? attempt.startedAt }) }
}

export default SitePublishWorkflow
