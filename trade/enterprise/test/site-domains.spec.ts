/** Domain parsing, project ownership and provider-supplied routing guidance. */
import { describe, expect, it } from 'vitest'
import { siteDomainCommand, siteDomainName } from '../src/site-domains-schema.ts'
import { vercelDomains, type VercelRequest } from '../src/site-vercel-domains.ts'
import type { HostingProjectId } from '../src/site-hosting-schema.ts'

const projectId = 'prj_domains' as HostingProjectId
const signal = new AbortController().signal
const domain = { name: 'www.example.com', apexName: 'example.com', projectId, verified: false, verification: [{ type: 'TXT', domain: '_vercel.example.com', value: 'vc-domain-verify=proof' }] }

describe('Sites custom domains', () => {
  it('normalizes internationalized hostnames and rejects URL or IP inputs before provider calls', () => {
    expect(siteDomainName.parse(' WWW.Example.com. ')).toBe('www.example.com')
    expect(siteDomainName.parse('例子.测试')).toBe('xn--fsqu00a.xn--0zwm56d')
    for (const name of ['https://example.com', 'user@example.com', 'example.com/path', 'example.com:443', 'example.com?query', '*.example.com', '127.0.0.1', '[::1]', 'a..example.com', '-bad.example', 'example.com%2fpath']) expect(siteDomainName.safeParse(name).success, name).toBe(false)
    expect(siteDomainCommand.safeParse({ operation: 'add', name: 'example.com', expectedGeneration: 1 }).success).toBe(false)
  })

  it('keeps ownership challenges separate from DNS routing and selects provider-ranked records', async () => {
    const paths: string[] = []
    const api: VercelRequest = async path => {
      paths.push(path)
      if (path.startsWith('/v9/')) return { domains: [domain, { ...domain, name: 'example.com', verified: true, verification: [] }], pagination: { next: null } }
      return { misconfigured: true, recommendedCNAME: [{ rank: 2, value: 'alternative.vercel-dns.com' }, { rank: 1, value: 'chosen.vercel-dns.com' }], recommendedIPv4: [{ rank: 1, value: ['192.0.2.42'] }] }
    }
    const provider = vercelDomains(api, async () => {}, { maxDomains: 20, maxPages: 2 })
    const result = await provider.domains(projectId, signal)
    expect(result[0]).toEqual({ name: 'www.example.com', verified: false, configured: false, managed: false, dns: [
      { type: 'TXT', name: '_vercel.example.com', value: 'vc-domain-verify=proof', purpose: 'ownership' },
      { type: 'CNAME', name: 'www.example.com', value: 'chosen.vercel-dns.com', purpose: 'routing' },
    ] })
    expect(result[1]).toMatchObject({ name: 'example.com', verified: true, configured: false, dns: [{ type: 'A', name: 'example.com', value: '192.0.2.42', purpose: 'routing' }] })
    expect(paths).toContain('/v6/domains/www.example.com/config?projectId=prj_domains')
  })

  it('uses project-scoped attach, verify and detach endpoints without transfers or DNS mutations', async () => {
    const calls: { path: string; body?: unknown; method?: string }[] = []
    const provider = vercelDomains(async (path, _signal, body, method) => { calls.push({ path, body, method }); return domain }, async () => {}, { maxDomains: 20, maxPages: 2 })
    const name = siteDomainName.parse(domain.name)
    await provider.changeDomain(projectId, 'add', name, signal)
    await provider.changeDomain(projectId, 'verify', name, signal)
    await provider.changeDomain(projectId, 'remove', name, signal)
    expect(calls).toEqual([
      { path: '/v10/projects/prj_domains/domains', body: { name }, method: undefined },
      { path: '/v9/projects/prj_domains/domains/www.example.com', body: undefined, method: undefined },
      { path: '/v9/projects/prj_domains/domains/www.example.com/verify', body: {}, method: 'POST' },
      { path: '/v9/projects/prj_domains/domains/www.example.com', body: undefined, method: undefined },
      { path: '/v9/projects/prj_domains/domains/www.example.com', body: undefined, method: 'DELETE' },
    ])
    await expect(provider.changeDomain(projectId, 'remove', siteDomainName.parse('default.vercel.app'), signal)).rejects.toThrow('Provider-managed')
    expect(calls).toHaveLength(5)
  })

  it('refuses foreign project domains and incomplete or repeated pagination', async () => {
    const foreign = vercelDomains(async () => ({ ...domain, projectId: 'someone-else' }), async () => {}, { maxDomains: 1, maxPages: 1 })
    await expect(foreign.changeDomain(projectId, 'remove', siteDomainName.parse(domain.name), signal)).rejects.toThrow('authorized project')
    const oversized = vercelDomains(async () => ({ domains: [domain, domain], pagination: { next: null } }), async () => {}, { maxDomains: 1, maxPages: 1 })
    await expect(oversized.domains(projectId, signal)).rejects.toThrow('configured limit')
    const repeated = vercelDomains(async () => ({ domains: [], pagination: { next: 100 } }), async () => {}, { maxDomains: 10, maxPages: 3 })
    await expect(repeated.domains(projectId, signal)).rejects.toThrow('did not advance')
  })
})
