/** Structured site editing vocabulary. This module contains types only. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ShopifyProductId, ShopifyThemeId, StoreConnectionId, TenantId } from '@deepseek-ai/dsh-shopify/types'

export type SiteId = Branded<'SiteId'>
export type SiteRevisionId = Branded<'SiteRevisionId'>
export type PublishJobId = Branded<'PublishJobId'>
export function SiteId(value: string): SiteId { return value as SiteId }
export function SiteRevisionId(value: string): SiteRevisionId { return value as SiteRevisionId }
export function PublishJobId(value: string): PublishJobId { return value as PublishJobId }

export interface Site {
  readonly id: SiteId
  readonly tenantId: TenantId
  readonly name: string
  /** Archived websites remain readable but reject edits and new publications. */
  readonly archived?: boolean
  /** Optimistic version for management operations; absent records start at zero. */
  readonly managementVersion?: number
  /** Optional commerce connection; a site can exist and publish without a store. */
  readonly connectionId?: StoreConnectionId
  readonly currentRevisionId?: SiteRevisionId
  /** Last revision whose publisher completed successfully. */
  readonly publishedRevisionId?: SiteRevisionId
}

export type SitePageKind = 'home' | 'product' | 'collection' | 'campaign'

export interface SitePage {
  readonly id: string
  readonly kind: SitePageKind
  readonly path: string
  readonly title: string
  readonly seo?: { readonly title?: string; readonly description?: string }
  readonly productIds?: readonly ShopifyProductId[]
}

export interface ThemeConfig {
  readonly colors: Readonly<Record<string, string>>
  readonly fonts: Readonly<Record<string, string>>
  readonly layout: Readonly<Record<string, string | number | boolean>>
}

export interface SiteChangeSet {
  /** Prior draft observed by the editor; omitted fields retain that draft's content. */
  readonly baseRevisionId?: SiteRevisionId
  readonly pages?: readonly SitePage[]
  readonly theme?: ThemeConfig
  readonly productOrder?: readonly ShopifyProductId[]
  /** Complete project tree; omitted projects inherit from the preceding revision. */
  readonly project?: SiteProject
}

/** One source or asset file. Base64 preserves binary assets across JSON storage. */
export interface SiteProjectFile {
  readonly path: string
  readonly content: string
  readonly encoding: 'utf8' | 'base64'
}

/** Source files owned by a site revision, independent of commerce and chat sessions. */
export interface SiteProject {
  readonly framework: 'static' | 'nextjs'
  readonly files: readonly SiteProjectFile[]
}

/** Complete editable content of one resolved revision. */
export interface SiteContent {
  readonly pages: readonly SitePage[]
  readonly theme?: ThemeConfig
  readonly productOrder: readonly ShopifyProductId[]
  readonly project?: SiteProject
}

/** Page changes and other editable fields shown before publication. */
export interface SiteRevisionDiff {
  readonly added: readonly SitePage[]
  readonly removed: readonly SitePage[]
  readonly changed: readonly { readonly before: SitePage; readonly after: SitePage }[]
  readonly pageOrderChanged: boolean
  readonly themeChanged: boolean
  readonly productOrderChanged: boolean
  /** Source and asset paths added, removed, or edited in the selected revision. */
  readonly files: {
    readonly added: readonly string[]
    readonly removed: readonly string[]
    readonly changed: readonly string[]
    readonly frameworkChanged: boolean
  }
}

export interface SiteRevision {
  readonly id: SiteRevisionId
  readonly siteId: SiteId
  readonly createdAt: string
  readonly source: 'user' | 'agent' | 'rollback'
  readonly changeSet: SiteChangeSet
}

export interface PublishJob {
  readonly id: PublishJobId
  readonly siteId: SiteId
  readonly revisionId: SiteRevisionId
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  readonly error?: string
  /** Human-reviewed destination and rendered-file digest, fixed when queued. */
  readonly target?: SitePublishTarget
  readonly attempts?: readonly SitePublishAttempt[]
}

/** Explicit Shopify destination selected by the authenticated editor. */
export interface SitePublishTarget {
  readonly connectionId: StoreConnectionId
  readonly themeId: ShopifyThemeId
  readonly digest: string
}

/** One durable execution attempt; uncertain remote effects require reconciliation before retry. */
export interface SitePublishAttempt {
  readonly number: number
  readonly startedAt: string
  readonly status: 'running' | 'succeeded' | 'failed'
  readonly finishedAt?: string
  readonly error?: string
}

/** Complete site state exported by a single service instance. */
export interface SiteSnapshot {
  readonly sites: readonly Site[]
  readonly revisions: readonly SiteRevision[]
  readonly jobs: readonly PublishJob[]
  /** Committed state changes awaiting transfer to the Session journal. */
  readonly pendingChanges?: readonly SiteStateChange[]
  readonly changeSequence?: number
  /** Deletion receipts allow deployment-owned stores to finish cleanup after restart. */
  readonly deletedSites?: readonly { readonly tenantId: TenantId; readonly siteId: SiteId }[]
}

/** Complete site metadata after one committed mutation; source bytes stay in revision storage. */
export interface SiteStateChange {
  readonly sequence: number
  readonly time: number
  readonly tenantId: TenantId
  readonly siteId: SiteId
  readonly site: Site | null
  readonly revisions: readonly { readonly id: SiteRevisionId; readonly createdAt: string; readonly source: SiteRevision['source'] }[]
  readonly jobs: readonly PublishJob[]
}

/** Synchronous transactional storage used before exposing changed site state. */
export interface SiteStateStore {
  /** Read and validate the latest state, or return undefined for an empty store. */
  load(): SiteSnapshot | undefined
  /** Atomically commit all state or throw without changing durable data. */
  commit(snapshot: SiteSnapshot): void
}
