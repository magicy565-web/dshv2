/** Snapshot file validation must leave live state intact on rejected input. */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TenantId, StoreConnectionId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'
import { parseSiteSnapshot } from '../src/snapshot.ts'

async function fixture() {
  const service = new InMemorySiteService(new Context(), async () => {})
  const site = service.createSite(TenantId('tenant'), 'Store', StoreConnectionId('connection'))
  const spec = { tenantId: site.tenantId, siteId: site.id }
  const revision = await service.createRevision(spec, { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Store' }] }, 'user')
  await service.publish(spec, revision.id)
  return { service, spec, revision }
}

describe('site snapshot persistence', () => {
  it('replaces a file and restores drafts, publication, and job history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-site-snapshot-'))
    try {
      const { service, spec } = await fixture()
      const path = join(directory, 'state.json')
      await service.save(path)
      const currentRevisionId = service.get(spec)?.currentRevisionId
      if (currentRevisionId === undefined) throw new Error('fixture did not create a current revision')
      await service.createRevision(spec, { baseRevisionId: currentRevisionId }, 'user')
      await service.save(path)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(service.snapshot())
      const restored = new InMemorySiteService(new Context())
      await restored.load(path)
      expect(restored.snapshot()).toEqual(service.snapshot())
      expect(await readdir(directory)).toEqual(['state.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('preserves current state after malformed file input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-site-invalid-'))
    try {
      const { service } = await fixture()
      const before = service.snapshot()
      const path = join(directory, 'state.json')
      await writeFile(path, JSON.stringify({ sites: [{}], revisions: [], jobs: [] }))
      await expect(service.load(path)).rejects.toThrow('invalid site snapshot')
      expect(service.snapshot()).toEqual(before)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects duplicate records and references to another site', async () => {
    const { service, revision } = await fixture()
    const snapshot = service.snapshot()
    expect(() => parseSiteSnapshot({ ...snapshot, sites: [...snapshot.sites, snapshot.sites[0]] })).toThrow('duplicate site')
    expect(() => parseSiteSnapshot({ ...snapshot, revisions: [...snapshot.revisions, revision] })).toThrow('duplicate revision')
    expect(() => parseSiteSnapshot({ ...snapshot, jobs: [...snapshot.jobs, snapshot.jobs[0]] })).toThrow('duplicate job')
    expect(() => parseSiteSnapshot({ ...snapshot, sites: [{ ...snapshot.sites[0], currentRevisionId: 'missing' }] })).toThrow('reference')
    expect(() => parseSiteSnapshot({ ...snapshot, jobs: [{ ...snapshot.jobs[0], siteId: 'other' }] })).toThrow('publication job')
    expect(() => parseSiteSnapshot({ ...snapshot, revisions: [{ ...revision, changeSet: { baseRevisionId: revision.id } }] })).toThrow('base revision')
    const other = service.createSite(TenantId('another'), 'Other', StoreConnectionId('other'))
    expect(() => parseSiteSnapshot({ ...service.snapshot(), sites: [{ ...other, currentRevisionId: revision.id }, snapshot.sites[0]] })).toThrow('reference')
  })

  it.each([null, {}, { sites: [], revisions: [null], jobs: [] }, { sites: [], revisions: [], jobs: [{}] }])('rejects malformed record input %j', (value) => {
    expect(() => parseSiteSnapshot(value)).toThrow('invalid site snapshot')
  })
})
