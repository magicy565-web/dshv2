/** Validated operations between Commerce and the enterprise credential owner. */
import { z } from 'zod'
import { id, schemas } from './schema.ts'

const connectionId = z.string().min(1).max(120).brand<'EnterpriseStoreId'>()
const domain = z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/)
/** A publication selection is immutable for a launch after its first draft attempt. */
export const storeBinding = z.object({ connectionId, domain, publicationId: z.string().regex(/^gid:\/\/shopify\/Publication\/\d+$/), publicationName: z.string().min(1).max(300) }).strict()
/** Safe connection metadata; access tokens are never serialized here. */
export const storeList = z.array(z.object({ connectionId, domain, status: z.enum(['pending', 'connected', 'revoked', 'failed']), scopes: z.array(z.string()), credentialAvailable: z.boolean() }).strict())
/** First page of available publication targets with explicit pagination state. */
export const publicationList = z.object({ nodes: z.array(z.object({ id: storeBinding.shape.publicationId, name: z.string().min(1).max(300) }).strict()), hasMore: z.boolean() }).strict()
const destination = storeBinding.omit({ publicationName: true })
const owned = { merchantId: id }
/** Closed operation vocabulary; arbitrary GraphQL, domains and credentials are excluded. */
export const storeOperation = z.discriminatedUnion('operation', [
  z.object({ ...owned, operation: z.literal('stores') }).strict(),
  z.object({ ...owned, operation: z.literal('publications'), connectionId }).strict(),
  z.object({ ...owned, operation: z.literal('catalog'), destination }).strict(),
  z.object({ ...owned, operation: z.literal('draft'), destination, launch: schemas.launch, listing: schemas.listing }).strict(),
  z.object({ ...owned, operation: z.literal('publish'), destination, productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/), launchId: id }).strict(),
  z.object({ ...owned, operation: z.literal('inspect'), destination, productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/), launchId: id }).strict(),
])
/** Typed store operation at the server wire. */
export type StoreOperation = z.infer<typeof storeOperation>
/** Persisted store selection without a credential. */
export type StoreBinding = z.infer<typeof storeBinding>
