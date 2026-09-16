/** Structured site editing vocabulary. This module contains types only. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ShopifyProductId, StoreConnectionId, TenantId } from '@deepseek-ai/dsh-shopify'

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
  readonly connectionId: StoreConnectionId
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
}

/** Complete editable content of one resolved revision. */
export interface SiteContent {
  readonly pages: readonly SitePage[]
  readonly theme?: ThemeConfig
  readonly productOrder: readonly ShopifyProductId[]
}

/** Page changes and other editable fields shown before publication. */
export interface SiteRevisionDiff {
  readonly added: readonly SitePage[]
  readonly removed: readonly SitePage[]
  readonly changed: readonly { readonly before: SitePage; readonly after: SitePage }[]
  readonly pageOrderChanged: boolean
  readonly themeChanged: boolean
  readonly productOrderChanged: boolean
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
}

/** Complete site state exported by a single service instance. */
export interface SiteSnapshot {
  readonly sites: readonly Site[]
  readonly revisions: readonly SiteRevision[]
  readonly jobs: readonly PublishJob[]
}

/** Synchronous transactional storage used before exposing changed site state. */
export interface SiteStateStore {
  /** Read and validate the latest state, or return undefined for an empty store. */
  load(): SiteSnapshot | undefined
  /** Atomically commit all state or throw without changing durable data. */
  commit(snapshot: SiteSnapshot): void
}
