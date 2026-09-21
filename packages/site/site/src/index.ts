/** Service Definition for structured AI site editing and publishing. */
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  PublishJob, PublishJobId, Site, SiteChangeSet, SiteId, SiteRevision, SiteRevisionId, SiteContent,
  SiteRevisionDiff, SiteProject, SitePublishTarget, SitePublishAttempt,
} from './types.ts'
import { compareSiteContent } from './revisions.ts'
import { renderPageJsonLd, renderRobots, renderSitePage, renderSitemap } from './render.ts'
import type { SiteArtifact } from './project.ts'
import { staticSiteRendering, type SiteRendering } from './rendering.ts'
import type { TenantId, StoreConnectionId } from '@deepseek-ai/dsh-shopify'

export * from './types.ts'
export { SiteTemplateService, SiteTemplateError, SITE_TEMPLATE_RECEIPT } from './templates.ts'
export type { SiteTemplateId, SiteTemplateValue, SiteTemplateParameters, SiteTemplateDescriptor, SiteTemplateProvider, SiteTemplateRequest, SiteTemplateReceipt } from './template-types.ts'
export { assertValidSiteChangeSet, validateSiteChangeSet } from './validation.ts'
export { renderPageJsonLd, renderRobots, renderSitePage, renderSitemap } from './render.ts'
export { createShopifySitePublisher, renderShopifyThemeFiles } from './shopify-publisher.ts'
export type { SiteThemeRenderer } from './shopify-publisher.ts'
export { buildStaticSite, sitePreviewResponse, validateSiteProject } from './project.ts'
export type { SiteArtifact, SiteArtifactFile } from './project.ts'
export { staticSiteRendering } from './rendering.ts'
export type { SiteRendering } from './rendering.ts'

/** Authenticated tenant and requested site to authorize. */
export interface SiteResolveRequest { readonly tenantId: TenantId; readonly siteId: SiteId }
/** Authorized tenant and site identity for service operations. */
export interface SiteSpec { readonly tenantId: TenantId; readonly siteId: SiteId }

/** Public files generated from the last successfully published revision. */
export type PublicSiteFiles = Readonly<Record<string, string>>

/** Execute the external publication side effect for one detached site revision. */
export type SitePublisher = (site: Site, revision: SiteRevision) => Promise<void>

declare module '@deepseek-ai/cordis' {
  interface Context { site: SiteService }
}

/** Site editing service. It accepts typed change sets and never accepts raw Shopify API requests. */
export abstract class SiteService extends Service {
  /** Rename or archive a site against the observed management version.
   * @param spec - Authorized tenant and site.
   * @param expectedVersion - Observed management version, zero before the first management change.
   * @param changes - New name or archive status. Active publication prevents archiving.
   * @returns Committed metadata with an incremented management version.
   */
  abstract manage(spec: SiteSpec, expectedVersion: number, changes: { name?: string; archived?: boolean }): Site
  /** Delete an archived site, its source revisions and jobs; retain a cleanup receipt.
   * @param spec - Authorized tenant and site.
   * @param expectedVersion - Observed management version.
   * @throws When the site is active, published through its publisher, or has pending jobs.
   */
  abstract deleteSite(spec: SiteSpec, expectedVersion: number): void
  constructor(ctx: Context, private readonly rendering: SiteRendering = staticSiteRendering) { super(ctx, 'site') }
  /** Create a site for an authorized tenant, optionally connected to commerce.
   * @param tenantId - Identity supplied by the authenticated host.
   * @param name - Site display name.
   * @param connectionId - Store connection already authorized by the host, if any.
   * @returns The stored site with no draft or production revision.
   */
  abstract createSite(tenantId: TenantId, name: string, connectionId?: StoreConnectionId): Site
  /** Atomically create an independent site and its first source revision.
   * @param tenantId - Authenticated owner.
   * @param name - Site display name.
   * @param project - Complete validated source project.
   * @param source - Actor creating the initial draft.
   * @returns Site pointing to its first revision; failed persistence leaves neither record.
   */
  abstract createSiteWithProject(tenantId: TenantId, name: string, project: SiteProject, source: SiteRevision['source']): Site
  /** List sites owned by the authorized tenant.
   * @param tenantId - Authenticated tenant identity.
   * @returns Detached site records.
   */
  abstract list(tenantId: TenantId): readonly Site[]
  /** Resolve tenant and site identity into an explicit operation spec.
   * @param request - Authenticated tenant and requested site.
   * @returns Authorized site identity; rejects unavailable sites.
   */
  abstract resolve(request: SiteResolveRequest): SiteSpec
  /** Read a tenant-owned site.
   * @param spec - Authorized tenant and site identity.
   * @returns A detached site, or undefined when unavailable.
   */
  abstract get(spec: SiteSpec): Site | undefined
  /** Read the current or requested revision.
   * @param spec - Authorized tenant and site identity.
   * @param revisionId - Exact revision, or the current draft when omitted.
   * @returns A detached revision, or undefined when unavailable.
   */
  abstract getRevision(spec: SiteSpec, revisionId?: SiteRevisionId): SiteRevision | undefined
  /** List revisions newest first for the tenant-owned site.
   * @param spec - Authorized tenant and site identity.
   * @returns Detached revision history, or an empty list when unavailable.
   */
  abstract listRevisions(spec: SiteSpec): readonly SiteRevision[]
  /** Persist a validated change set only against the draft observed by its editor.
   * @param spec - Authorized tenant and site identity.
   * @param changeSet - Edits whose baseRevisionId equals the current draft, or is absent for the first draft.
   * @param source - Origin recorded in version history.
   * @returns The committed revision; validation and storage failures reject the promise.
   * @throws When the observed draft is stale, including a missing base on a nonempty site.
   */
  abstract createRevision(spec: SiteSpec, changeSet: SiteChangeSet, source: SiteRevision['source']): Promise<SiteRevision>
  /** Resolve partial edits through their recorded bases within one tenant-owned site.
   * @param spec - Resolved tenant and site.
   * @param revisionId - Revision whose complete content is required.
   * @returns Detached pages, theme and product order.
   */
  content(spec: SiteSpec, revisionId: SiteRevisionId): SiteContent {
    const chain: SiteRevision[] = []
    const visited = new Set<SiteRevisionId>()
    let next: SiteRevisionId | undefined = revisionId
    while (next !== undefined) {
      if (visited.has(next)) throw new Error('site revision ancestry contains a cycle')
      visited.add(next)
      const revision: SiteRevision | undefined = this.getRevision(spec, next)
      if (!revision) throw new Error('site revision is not available for this tenant')
      chain.push(revision)
      if (revision.source === 'rollback') break
      next = revision.changeSet.baseRevisionId
    }
    let content: SiteContent = { pages: [], productOrder: [] }
    for (const revision of chain.reverse()) {
      const { baseRevisionId: _base, ...changes } = revision.changeSet
      content = { ...content, ...changes }
    }
    return structuredClone(content)
  }
  /** Compare two stored revisions without crossing tenant or site ownership.
   * @param spec - Resolved tenant and site.
   * @param revisionId - Revision proposed for publication.
   * @param baseRevisionId - Earlier revision, or undefined for empty content.
   * @returns Page, theme and ordering differences for review.
   */
  diff(spec: SiteSpec, revisionId: SiteRevisionId, baseRevisionId?: SiteRevisionId): SiteRevisionDiff {
    return compareSiteContent(baseRevisionId === undefined ? undefined : this.content(spec, baseRevisionId), this.content(spec, revisionId))
  }
  /** Build an immutable static artifact from the selected authorized project revision.
   * @param spec - Authenticated tenant and site identity.
   * @param revisionId - Exact saved source version to build.
   * @returns Static files and their content digest; does not publish or execute project code.
   * @throws When the revision has no project or requires an isolated framework compiler.
   */
  build(spec: SiteSpec, revisionId: SiteRevisionId): SiteArtifact {
    const project = this.content(spec, revisionId).project
    if (!project) throw new Error('site revision has no source project')
    return this.rendering.build(revisionId, project)
  }
  /** Render an already compiled artifact through the installed preview provider.
   * @param artifact - Immutable artifact obtained from an authorized revision.
   * @param path - Requested project-relative browser path.
   * @param resolveUrl - Host-owned resolver for private or public navigation.
   * @param maxBytes - Deployment output limit.
   * @param parentNavigation - Whether links ask the authenticated parent to load another preview page.
   * @returns Isolated browser response; compilation never executes generated code on the Host.
   */
  renderArtifact(artifact: SiteArtifact, path: string, resolveUrl: (path: string) => string, maxBytes: number, parentNavigation: boolean = false): Promise<Response> {
    return this.rendering.preview(artifact, path, resolveUrl, maxBytes, parentNavigation)
  }
  /** Render a page from resolved draft content; this does not publish it.
   * @param spec - Resolved tenant and site.
   * @param revisionId - Stored revision to preview.
   * @param pageId - Page identifier in the complete revision.
   * @param origin - Public origin for canonical links.
   * @returns Standalone HTML, which consumers must serve as a private preview.
   */
  preview(spec: SiteSpec, revisionId: SiteRevisionId, pageId: string, origin: string): string {
    const revision = this.getRevision(spec, revisionId)
    if (!revision) throw new Error('site revision is not available for this tenant')
    const content = this.content(spec, revisionId)
    const page = content.pages.find(item => item.id === pageId)
    if (!page) throw new Error('page is not available in this revision')
    return renderSitePage({ ...revision, changeSet: content }, page, origin)
  }
  /** Render only the committed public revision; drafts never enter this result.
   * @param spec - Resolved tenant and site.
   * @param origin - Public HTTP(S) origin used for canonical URLs.
   * @returns Static files suitable for a read-only public adapter.
   */
  publicFiles(spec: SiteSpec, origin: string): PublicSiteFiles {
    const site = this.get(spec)
    if (!site?.publishedRevisionId) return {}
    const revision = this.getRevision(spec, site.publishedRevisionId)
    if (!revision) throw new Error('published site revision is missing')
    const content = this.content(spec, revision.id)
    const files: Record<string, string> = { 'sitemap.xml': renderSitemap({ ...revision, changeSet: content }, origin), 'robots.txt': renderRobots(origin) }
    for (const page of content.pages) {
      const filename = page.path === '/' ? 'index.html' : `${page.path.slice(1).replace(/\/$/, '')}/index.html`
      files[filename] = renderSitePage({ ...revision, changeSet: content }, page, origin)
      files[filename.replace(/\.html$/, '.jsonld')] = renderPageJsonLd(page, origin)
    }
    return structuredClone(files)
  }
  /** Create a rollback revision from an existing revision.
   * @param spec - Authorized tenant and site identity.
   * @param revisionId - Historical revision to restore.
   * @returns A new draft containing the selected revision's complete content.
   */
  async rollback(spec: SiteSpec, revisionId: SiteRevisionId): Promise<SiteRevision> {
    const revision = this.getRevision(spec, revisionId)
    if (!revision) throw new Error('site revision is not available for this tenant')
    const baseRevisionId = this.get(spec)?.currentRevisionId
    const content = this.content(spec, revision.id)
    return this.createRevision(spec, { ...content, ...(baseRevisionId === undefined ? {} : { baseRevisionId }) }, 'rollback')
  }
  /** Queue and execute publication; reject when no publisher is configured.
   * @param spec - Authorized tenant and site identity.
   * @param revisionId - Saved revision to publish.
   * @returns The job after publication settles.
   */
  abstract publish(spec: SiteSpec, revisionId: SiteRevisionId): Promise<PublishJob>
  /** Queue one immutable revision; coalesce a duplicate queued or running request.
   * @param spec - Authorized tenant and site identity.
   * @param revisionId - Saved revision to queue.
   * @param target - Optional immutable store, theme and reviewed files digest.
   * @returns The queued or existing job; validation and storage failures reject the promise.
   */
  abstract queuePublishJob(spec: SiteSpec, revisionId: SiteRevisionId, target?: SitePublishTarget): Promise<PublishJob>
  /** Persist an attempt before dispatch or after its response, while its job is running.
   * @param spec - Authorized site.
   * @param jobId - Running job.
   * @param attempt - Full replacement for the numbered attempt.
   */
  abstract recordPublishAttempt(spec: SiteSpec, jobId: PublishJobId, attempt: SitePublishAttempt): void
  /** Execute a queued job, retaining the prior publication on failure.
   * @param spec - Resolved tenant and site.
   * @param jobId - Queued publication job.
   * @param publisher - Optional external side effect; the configured provider is used when omitted.
   * @returns The committed job status after the side effect settles.
   */
  abstract runPublishJob(spec: SiteSpec, jobId: PublishJobId, publisher?: SitePublisher): Promise<PublishJob>
  /** Read one publication job by opaque id.
   * @param spec - Authorized tenant and site identity.
   * @param jobId - Requested publication job.
   * @returns A detached job, or undefined when unavailable.
   */
  abstract getPublishJob(spec: SiteSpec, jobId: PublishJobId): PublishJob | undefined
  /** List publication jobs newest first for the tenant-owned site.
   * @param spec - Authorized tenant and site identity.
   * @returns Detached jobs, or an empty list when unavailable.
   */
  abstract listPublishJobs(spec: SiteSpec): readonly PublishJob[]
  /** Cancel a queued publication without deleting its history.
   * @param spec - Authorized tenant and site identity.
   * @param jobId - Queued or already cancelled job.
   * @returns The cancelled job; unavailable or running jobs and storage failures reject the promise.
   */
  abstract cancelPublishJob(spec: SiteSpec, jobId: PublishJobId): Promise<PublishJob>
}

export default SiteService
