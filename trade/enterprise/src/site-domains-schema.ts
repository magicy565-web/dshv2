/** Portable domain names and provider-supplied DNS instructions shared by the Host and browser. */
import { z } from 'zod'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Canonical ASCII DNS name, without a URL scheme, path or port. */
export type SiteDomainName = Branded<'SiteDomainName'>

/** Parse a hostname and normalize internationalized labels without accepting URL syntax. */
export const siteDomainName = z.string().trim().min(1).max(253).transform((input, context) => {
  let name = ''
  if (!/[\s/@:#?%\\*]/u.test(input)) {
    try { name = new URL(`https://${input.replace(/\.$/, '')}`).hostname.toLowerCase() }
    catch { /* Invalid hostname syntax is reported by the schema issue below. */ }
  }
  const labels = name.split('.')
  if (name.length > 253 || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/[a-z]/.test(labels.at(-1) ?? '')) {
    context.addIssue({ code: 'custom', message: 'Enter a DNS hostname without a scheme, path, port or wildcard' })
    return z.NEVER
  }
  return name as SiteDomainName
})

/** Validated domain status; verification and DNS routing are distinct observations. */
export const siteDomainSchema = z.object({
  name: siteDomainName,
  verified: z.boolean(), configured: z.boolean(), managed: z.boolean(),
  dns: z.array(z.object({ type: z.string().min(1), name: z.string().min(1), value: z.string().min(1), purpose: z.enum(['ownership', 'routing']) }).strict()),
}).strict()

/** Provider observations and DNS instructions for a bound hostname. */
export type SiteDomain = z.infer<typeof siteDomainSchema>

/** Browser-selected domain operation with an explicit observed hosting generation. */
export const siteDomainCommand = z.object({
  operation: z.enum(['add', 'verify', 'remove']), name: siteDomainName,
  expectedGeneration: z.number().int().nonnegative(), confirmed: z.literal(true),
}).strict()
