import { Context, Service } from '@deepseek-ai/cordis'
import type { CollectionSummary, ProductSummary, PublishRequest, PublishResult, ShopifyResolveRequest, ShopifyStoreSpec, StoreConnection, StoreConnectionId, StoreMode, ThemeSummary } from './types.ts'

export interface ShopifyStoreProvider {
  readonly mode: StoreMode
  listProducts(spec: ShopifyStoreSpec): Promise<readonly ProductSummary[]>
  listCollections(spec: ShopifyStoreSpec): Promise<readonly CollectionSummary[]>
  listThemes(spec: ShopifyStoreSpec): Promise<readonly ThemeSummary[]>
  publish(spec: ShopifyStoreSpec, request: PublishRequest): Promise<PublishResult>
}

declare module '@deepseek-ai/cordis' { interface Context { shopifyStore: ShopifyStoreService } }

export abstract class ShopifyStoreService extends Service {
  constructor(ctx: Context) { super(ctx, 'shopifyStore') }
  abstract resolve(request: ShopifyResolveRequest): ShopifyStoreSpec
  abstract getConnection(id: StoreConnectionId): StoreConnection | undefined
  abstract provider(spec: ShopifyStoreSpec): ShopifyStoreProvider
}
