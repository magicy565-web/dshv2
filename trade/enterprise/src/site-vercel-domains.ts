/** Project-scoped Vercel domains and live DNS recommendations, without account transfers or DNS writes. */
import { z } from 'zod'
import { siteDomainName, type SiteDomain } from './site-domains-schema.ts'
import { HostingRejected, type SiteHostingProvider } from './site-hosting-provider.ts'
import type { HostingProjectId } from './site-hosting-schema.ts'
import { assertNever } from '@deepseek-ai/dsh-util-values'

/** Authenticated request adapter with a fixed Vercel origin and configured response limits. */
export type VercelRequest = (path: string, signal: AbortSignal, body?: unknown, method?: string) => Promise<unknown>

const domainSchema = z.object({
  name: siteDomainName, apexName: siteDomainName, projectId: z.string(), verified: z.boolean(),
  verification: z.array(z.object({ type: z.string(), domain: z.string(), value: z.string() })).optional(),
})
const dnsSchema = z.object({
  misconfigured: z.boolean(),
  recommendedIPv4: z.array(z.object({ rank: z.number(), value: z.array(z.string()) })).optional(),
  recommendedCNAME: z.array(z.object({ rank: z.number(), value: z.string() })).optional(),
})

/** Provide domain operations through a credential-owning Vercel request adapter.
 * @param api - Fixed-origin authenticated request implementation.
 * @param authorizeProject - Recheck the persisted provider project identity.
 * @param limits - Maximum domains and pages permitted in one observation.
 * @returns Domain reads and explicitly selected mutations; never buys, transfers or moves domains.
 */
export function vercelDomains(api: VercelRequest, authorizeProject: (id: HostingProjectId, signal: AbortSignal) => Promise<unknown>, limits: { maxDomains: number; maxPages: number }): Pick<SiteHostingProvider, 'domains' | 'changeDomain'> {
  return {
    async domains(projectId, signal) {
      await authorizeProject(projectId, signal)
      const domains: SiteDomain[] = []
      const names = new Set<string>()
      let until: number | undefined
      for (let page = 0; page < limits.maxPages; page++) {
        const query = new URLSearchParams({ limit: String(Math.min(limits.maxDomains, 100)), ...(until === undefined ? {} : { until: String(until) }) })
        const result = z.object({ domains: z.array(domainSchema), pagination: z.object({ next: z.number().nullable() }) }).parse(await api(`/v9/projects/${encodeURIComponent(projectId)}/domains?${query}`, signal))
        if (domains.length + result.domains.length > limits.maxDomains) throw new Error('Domain list exceeds the configured limit')
        for (const domain of result.domains) {
          if (domain.projectId !== projectId || names.has(domain.name)) throw new Error('Invalid project domain ownership or duplicate domain')
          names.add(domain.name)
          const managed = domain.name.endsWith('.vercel.app')
          const dns: SiteDomain['dns'] = (domain.verification ?? []).map(record => ({ type: record.type, name: record.domain, value: record.value, purpose: 'ownership' }))
          let configured = domain.verified
          if (!managed) {
            const config = dnsSchema.parse(await api(`/v6/domains/${encodeURIComponent(domain.name)}/config?${new URLSearchParams({ projectId })}`, signal))
            configured = !config.misconfigured
            const cname = [...(config.recommendedCNAME ?? [])].sort((a, b) => a.rank - b.rank)[0]
            const ipv4 = [...(config.recommendedIPv4 ?? [])].sort((a, b) => a.rank - b.rank)[0]
            if (domain.name !== domain.apexName && cname) dns.push({ type: 'CNAME', name: domain.name, value: cname.value, purpose: 'routing' })
            else if (ipv4) for (const address of ipv4.value) dns.push({ type: 'A', name: domain.name, value: address, purpose: 'routing' })
          }
          domains.push({ name: domain.name, verified: domain.verified, managed, configured, dns })
        }
        if (result.pagination.next === null) return domains
        if (until !== undefined && result.pagination.next >= until) throw new Error('Domain pagination did not advance')
        until = result.pagination.next
      }
      throw new Error('Domain list exceeds the configured page limit')
    },
    async changeDomain(projectId, operation, name, signal) {
      if (name.endsWith('.vercel.app')) throw new HostingRejected('Provider-managed domains cannot be changed here')
      await authorizeProject(projectId, signal)
      const path = `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(name)}`
      switch (operation) {
        case 'add':
          await api(`/v10/projects/${encodeURIComponent(projectId)}/domains`, signal, { name })
          return
        case 'verify':
        case 'remove': {
          const domain = domainSchema.parse(await api(path, signal))
          if (domain.projectId !== projectId || domain.name !== name) throw new HostingRejected('Domain is not attached to the authorized project')
          await api(operation === 'verify' ? `${path}/verify` : path, signal, operation === 'verify' ? {} : undefined, operation === 'verify' ? 'POST' : 'DELETE')
          return
        }
        default: return assertNever(operation)
      }
    },
  }
}
