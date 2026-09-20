/** Initial project creation publishes site and revision records only after one durable commit. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { TenantId } from '@deepseek-ai/dsh-shopify'
import { InMemorySiteService } from '../src/memory.ts'
import type { SiteSnapshot } from '../src/types.ts'

it('creates an initial draft atomically and restores memory on failed persistence', async () => {
  const ctx = new Context()
  let persisted: SiteSnapshot | undefined
  let fail = true
  let commits = 0
  try {
    const service = new InMemorySiteService(ctx, undefined, {
      load: () => persisted,
      commit(snapshot) {
        commits++
        if (fail) throw new Error('Storage unavailable')
        persisted = structuredClone(snapshot)
      },
    })
    const project = { framework: 'static' as const, files: [{ path: 'index.html', content: '<h1>Example</h1>', encoding: 'utf8' as const }] }
    const tenant = TenantId('owner')
    expect(() => service.createSiteWithProject(tenant, 'Example', project, 'user')).toThrow('Storage unavailable')
    expect(service.snapshot()).toEqual({ sites: [], revisions: [], jobs: [] })
    expect(persisted).toBeUndefined()
    fail = false
    const site = service.createSiteWithProject(tenant, 'Example', project, 'user')
    expect(commits).toBe(2)
    expect(persisted?.sites[0]?.currentRevisionId).toBe(persisted?.revisions[0]?.id)
    expect(service.getRevision({ tenantId: tenant, siteId: site.id })?.changeSet.project).toEqual(project)
    expect(service.list(TenantId('other'))).toEqual([])
    project.files[0]!.content = 'External mutation'
    expect(service.getRevision({ tenantId: tenant, siteId: site.id })?.changeSet.project?.files[0]?.content).toBe('<h1>Example</h1>')
  } finally { await ctx.fiber.dispose() }
})
