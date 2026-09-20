/** Closed business operations allowed through the authenticated enterprise UI. */
import { z } from 'zod'

/** Read routes supported by the embedded workspace. */
export const embeddedReads = ['workspace', 'manifest'] as const
/** Write routes retain their normal business permission and approval checks. */
export const embeddedWrites = ['commands', 'agent', 'agent/apply', 'agent/check', 'shopify/stores', 'shopify/publications', 'shopify/select', 'shopify/catalog', 'shopify/draft', 'shopify/publish', 'shopify/reconcile'] as const
/** A deployment-authenticated dispatch cannot select a subject id or arbitrary URL. */
export const embeddedRequest = z.discriminatedUnion('method', [
  z.object({ role: z.enum(['factory', 'merchant']), method: z.literal('GET'), route: z.enum(embeddedReads) }).strict(),
  z.object({ role: z.enum(['factory', 'merchant']), method: z.literal('POST'), route: z.enum(embeddedWrites), body: z.unknown() }).strict(),
])
