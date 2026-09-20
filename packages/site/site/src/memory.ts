import { randomUUID } from 'node:crypto'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { StoreConnectionId, TenantId } from '@deepseek-ai/dsh-shopify'
import { assertValidSiteChangeSet } from './validation.ts'
import { parseSiteSnapshot } from './snapshot.ts'
import { SiteService, type SitePublisher, type SiteSpec } from './index.ts'
import type { PublishJob, PublishJobId, Site, SiteChangeSet, SiteId, SiteRevision, SiteRevisionId, SiteSnapshot, SiteStateStore } from './types.ts'
import type { SiteProject } from './types.ts'

/** In-memory site service that exercises tenant checks and the draft/publish lifecycle. */
export class InMemorySiteService extends SiteService {
  private readonly sites = new Map<SiteId, Site>()
  private readonly revisions = new Map<SiteRevisionId, SiteRevision>()
  private readonly jobs = new Map<PublishJobId, PublishJob>()
  private readonly activeSites = new Set<SiteId>()
  constructor(
    ctx: Context,
    private readonly publisher?: (site: Site, revision: SiteRevision) => Promise<void>,
    private readonly storage?: SiteStateStore,
  ) {
    super(ctx)
    const snapshot = storage?.load()
    if (snapshot) this.restore(snapshot)
  }
  private commit(change: () => void): void {
    const before = this.snapshot()
    try {
      change()
      this.storage?.commit(this.snapshot())
    } catch (error) {
      this.replace(before)
      throw error
    }
  }
  private replace(snapshot: SiteSnapshot): void {
    this.sites.clear(); this.revisions.clear(); this.jobs.clear()
    for (const site of snapshot.sites) this.sites.set(site.id, site)
    for (const revision of snapshot.revisions) this.revisions.set(revision.id, revision)
    for (const job of snapshot.jobs) this.jobs.set(job.id, job)
  }
  private replaceRecovered(snapshot: SiteSnapshot): void {
    const recovered = {
      ...snapshot,
      jobs: snapshot.jobs.map(job => job.status === 'running'
        ? { ...job, status: 'failed' as const, error: 'publication interrupted; reconcile provider state before retrying' }
        : job),
    }
    this.replace(recovered)
  }
  resolve(request: { readonly tenantId: TenantId; readonly siteId: SiteId }): SiteSpec {
    const site = this.sites.get(request.siteId)
    if (site === undefined || site.tenantId !== request.tenantId) throw new Error('site is not available for this tenant')
    return { tenantId: request.tenantId, siteId: request.siteId }
  }
  get(spec: SiteSpec): Site | undefined {
    const site = this.sites.get(spec.siteId)
    return site?.tenantId === spec.tenantId ? structuredClone(site) : undefined
  }
  getRevision(spec: SiteSpec, revisionId?: SiteRevisionId): SiteRevision | undefined {
    const site = this.get(spec); if (!site) return undefined
    const id = revisionId ?? site.currentRevisionId; if (!id) return undefined
    const revision = this.revisions.get(id); return revision?.siteId === site.id ? structuredClone(revision) : undefined
  }
  listRevisions(spec: SiteSpec): readonly SiteRevision[] {
    const site = this.get(spec); if (!site) return []
    return structuredClone([...this.revisions.values()].filter(item => item.siteId === site.id).reverse())
  }
  // oxlint-disable-next-line typescript/require-await -- Validation and storage failures must reject the service promise.
  async createRevision(spec: SiteSpec, changeSet: SiteChangeSet, source: SiteRevision['source']): Promise<SiteRevision> {
    const site = this.get(spec); if (!site) throw new Error('site is not available for this tenant')
    assertValidSiteChangeSet(changeSet)
    if (changeSet.baseRevisionId !== site.currentRevisionId) throw new Error('site revision conflict')
    const recorded = { ...changeSet, ...(site.currentRevisionId === undefined ? {} : { baseRevisionId: site.currentRevisionId }) }
    const revision: SiteRevision = {
      id: brandString<SiteRevisionId>(randomUUID()), siteId: site.id, createdAt: new Date().toISOString(),
      source, changeSet: structuredClone(recorded),
    }
    this.commit(() => {
      this.revisions.set(revision.id, revision)
      this.sites.set(site.id, { ...site, currentRevisionId: revision.id })
    })
    return structuredClone(revision)
  }
  async publish(spec: SiteSpec, revisionId: SiteRevisionId): Promise<PublishJob> {
    if (!this.publisher) throw new Error('site publisher is not configured')
    const job = await this.queuePublishJob(spec, revisionId)
    return this.runPublishJob(spec, job.id)
  }
  // oxlint-disable-next-line typescript/require-await -- Validation and storage failures must reject the service promise.
  async queuePublishJob(spec: SiteSpec, revisionId: SiteRevisionId): Promise<PublishJob> {
    const revision = this.getRevision(spec, revisionId)
    if (!revision) throw new Error('site revision is not available for this tenant')
    for (const job of this.jobs.values()) {
      if (job.siteId === spec.siteId && job.revisionId === revisionId && (job.status === 'queued' || job.status === 'running')) {
        return structuredClone(job)
      }
    }
    const job: PublishJob = {
      id: brandString<PublishJobId>(randomUUID()), siteId: spec.siteId, revisionId, status: 'queued',
    }
    this.commit(() => { this.jobs.set(job.id, job) })
    return structuredClone(job)
  }
  /** Execute one queued publication under the site-wide lock.
   * @param spec - Authorized tenant and site identity.
   * @param jobId - Queued publication to execute.
   * @param publisherOverride - Publication side effect, or the configured publisher when omitted.
   * @returns The committed job status after publication settles.
   */
  async runPublishJob(spec: SiteSpec, jobId: PublishJobId, publisherOverride?: SitePublisher): Promise<PublishJob> {
    const queued = this.getPublishJob(spec, jobId)
    if (!queued) throw new Error('publication job is not available for this tenant')
    if (queued.status !== 'queued') throw new Error(`cannot run job with status '${queued.status}'`)
    const publisher = publisherOverride ?? this.publisher
    if (!publisher) throw new Error('site publisher is not configured')
    if (this.activeSites.has(spec.siteId)) throw new Error('site publication is already running')
    const site = this.get(spec)
    const revision = this.getRevision(spec, queued.revisionId)
    if (!site || !revision) throw new Error('site revision is not available for this tenant')
    this.activeSites.add(site.id)
    try {
      this.commit(() => { this.jobs.set(queued.id, { ...queued, status: 'running' }) })
      try {
        await publisher(site, revision)
      } catch (error) {
        const failed: PublishJob = { ...queued, status: 'failed', error: String(error) }
        this.commit(() => { this.jobs.set(queued.id, failed) })
        return structuredClone(failed)
      }
      const current = this.sites.get(site.id)
      if (current === undefined) throw new Error('site disappeared during publication')
      const succeeded: PublishJob = { ...queued, status: 'succeeded' }
      this.commit(() => {
        this.sites.set(site.id, { ...current, publishedRevisionId: revision.id })
        this.jobs.set(queued.id, succeeded)
      })
      return structuredClone(succeeded)
    } finally {
      this.activeSites.delete(site.id)
    }
  }
  getPublishJob(spec: SiteSpec, jobId: PublishJobId): PublishJob | undefined {
    const job = this.jobs.get(jobId)
    return job && this.get(spec)?.id === job.siteId ? structuredClone(job) : undefined
  }
  listPublishJobs(spec: SiteSpec): readonly PublishJob[] {
    const site = this.get(spec); if (!site) return []
    return structuredClone([...this.jobs.values()].filter(item => item.siteId === site.id).reverse())
  }
  // oxlint-disable-next-line typescript/require-await -- Validation and storage failures must reject the service promise.
  async cancelPublishJob(spec: SiteSpec, jobId: PublishJobId): Promise<PublishJob> {
    const job = this.getPublishJob(spec, jobId); if (!job) throw new Error('publication job is not available for this tenant')
    if (job.status !== 'queued' && job.status !== 'cancelled') throw new Error(`cannot cancel job with status '${job.status}'`)
    const cancelled = { ...job, status: 'cancelled' as const }
    this.commit(() => { this.jobs.set(job.id, cancelled) })
    return structuredClone(cancelled)
  }
  createSite(tenantId: TenantId, name: string, connectionId?: StoreConnectionId): Site {
    const site: Site = {
      id: brandString<SiteId>(randomUUID()), tenantId, name,
      ...(connectionId === undefined ? {} : { connectionId }),
    }
    this.commit(() => { this.sites.set(site.id, site) })
    return structuredClone(site)
  }
  list(tenantId: TenantId): readonly Site[] {
    return structuredClone([...this.sites.values()].filter(site => site.tenantId === tenantId))
  }
  createSiteWithProject(tenantId: TenantId, name: string, project: SiteProject, source: SiteRevision['source']): Site {
    assertValidSiteChangeSet({ project })
    const revisionId = brandString<SiteRevisionId>(randomUUID())
    const site: Site = { id: brandString<SiteId>(randomUUID()), tenantId, name, currentRevisionId: revisionId }
    const revision: SiteRevision = {
      id: revisionId, siteId: site.id, createdAt: new Date().toISOString(), source, changeSet: { project: structuredClone(project) },
    }
    this.commit(() => { this.sites.set(site.id, site); this.revisions.set(revisionId, revision) })
    return structuredClone(site)
  }
  /** Export all tenant-owned state for durable storage.
   * @returns Detached sites, revisions and publication jobs.
   */
  snapshot(): SiteSnapshot {
    return structuredClone({
      sites: [...this.sites.values()], revisions: [...this.revisions.values()], jobs: [...this.jobs.values()],
    })
  }
  /** Restore a previously exported state snapshot.
   * @param snapshot - Complete state to validate and commit; active publication prevents restore.
   */
  restore(snapshot: SiteSnapshot): void {
    if (this.activeSites.size > 0) throw new Error('cannot restore site state during publication')
    snapshot = parseSiteSnapshot(snapshot)
    this.commit(() =>{  this.replaceRecovered(snapshot) })
  }
  /** Atomically replace a snapshot file; its parent directory must exist.
   * @param path - Administrator-controlled destination file.
   */
  async save(path: string): Promise<void> {
    const data = JSON.stringify(this.snapshot())
    const temporary = `${path}.${randomUUID()}.tmp`
    const file = await open(temporary, 'wx', 0o600)
    try {
      try {
        await file.writeFile(data, 'utf8')
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, path)
    } finally {
      try { await unlink(temporary) } catch (error) {
        // A successful rename removes the owned temporary path.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
  /** Load a snapshot produced by {@link save}.
   * @param path - Administrator-controlled snapshot file to validate and restore.
   */
  async load(path: string): Promise<void> {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    this.restore(parseSiteSnapshot(parsed))
  }
}

export default InMemorySiteService
