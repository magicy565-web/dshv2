/** Shopify capability vocabulary. This module contains types only. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Tenant owning a store connection. */
export type TenantId = Branded<'TenantId'>
/** Opaque store connection, never a raw Shopify id. */
export type StoreConnectionId = Branded<'StoreConnectionId'>
export type ShopifyProductId = Branded<'ShopifyProductId'>
export type ShopifyCollectionId = Branded<'ShopifyCollectionId'>
export type ShopifyThemeId = Branded<'ShopifyThemeId'>

export function TenantId(value: string): TenantId { return value as TenantId }
export function StoreConnectionId(value: string): StoreConnectionId { return value as StoreConnectionId }
export function ShopifyProductId(value: string): ShopifyProductId { return value as ShopifyProductId }
export function ShopifyCollectionId(value: string): ShopifyCollectionId { return value as ShopifyCollectionId }
export function ShopifyThemeId(value: string): ShopifyThemeId { return value as ShopifyThemeId }

/** Store access mode selected explicitly by the owning application. */
export type StoreMode = 'public' | 'oauth'

export interface StoreConnection {
  readonly id: StoreConnectionId
  readonly tenantId: TenantId
  readonly mode: StoreMode
  readonly shopDomain: string
  readonly status: 'connected' | 'revoked' | 'unhealthy'
  readonly grantedScopes: readonly string[]
}

export interface ProductSummary {
  readonly id: ShopifyProductId
  readonly title: string
  readonly handle: string
  readonly description: string
  readonly imageUrl?: string
  readonly price?: string
  readonly currency?: string
  readonly available: boolean
}

export interface CollectionSummary {
  readonly id: ShopifyCollectionId
  readonly title: string
  readonly handle: string
  readonly productIds: readonly ShopifyProductId[]
}

export interface ThemeSummary {
  readonly id: ShopifyThemeId
  readonly name: string
  readonly role: 'main' | 'unpublished' | 'other'
}

export interface PublishRequest {
  readonly connectionId: StoreConnectionId
  readonly themeId: ShopifyThemeId
  readonly files: Readonly<Record<string, string>>
  readonly idempotencyKey: string
}

export interface PublishResult {
  readonly connectionId: StoreConnectionId
  readonly themeId: ShopifyThemeId
  readonly publishedAt: string
  readonly version: string
  readonly filesWritten: number
}

export interface ShopifyStoreSpec {
  readonly mode: StoreMode
  readonly connectionId: StoreConnectionId
  readonly tenantId: TenantId
  readonly requiredScopes: readonly string[]
}

export interface ShopifyResolveRequest {
  readonly mode: StoreMode
  readonly tenantId: TenantId
  readonly connectionId?: StoreConnectionId
}
