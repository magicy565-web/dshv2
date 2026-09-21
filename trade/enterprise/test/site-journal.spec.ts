/** Real JSONL persistence recovers the flush/ack crash window without duplicate activity. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JsonlSessionPersistence from '../../../packages/session/session-persistence-jsonl/src/index.ts'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { SiteJournal } from '../src/site-journal.ts'

describe('site Session journal', () => {
  it('replays metadata after an acknowledgement failure and retains a deletion event', async () => {
    const root = await mkdtemp(join(tmpdir(), 'site-journal-'))
    const ctx = new Context()
    try {
      await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
      const sites = new InMemorySiteService(ctx)
      const site = sites.createSite(TenantId('owner'), 'Original')
      const spec = { tenantId: site.tenantId, siteId: site.id }
      sites.manage(spec, 0, { name: 'Renamed' })
      const journal = new SiteJournal(sites, ctx.sessionPersistence)
      const ack = vi.spyOn(sites, 'acknowledgeChanges').mockImplementationOnce(() => { throw new Error('ack failed') })
      await expect(journal.flush()).rejects.toThrow('ack failed')
      expect(sites.pendingChanges()).toHaveLength(2)
      ack.mockRestore()
      const replayed = await new SiteJournal(sites, ctx.sessionPersistence).read(spec)
      expect(replayed.events.map(event => event.site?.name)).toEqual(['Original', 'Renamed'])
      expect(replayed.state).toEqual(replayed.events.at(-1))
      expect(sites.pendingChanges()).toEqual([])
      sites.manage(spec, 1, { archived: true })
      sites.deleteSite(spec, 2)
      await journal.flush()
      const handle = await ctx.sessionPersistence.open(replayed.sessionId, 'read')
      try { expect((await handle.read()).events.filter(event => event.type === 'site/state').at(-1)?.data).toMatchObject({ site: null, revisions: [], jobs: [] }) }
      finally { await handle.close() }
    } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
  })
})
