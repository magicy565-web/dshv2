/** Source projects survive storage and revision operations independently of Shopify. */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { TenantId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'
import { SqliteSiteStateStore } from '../src/sqlite.ts'
import { parseSiteChangeSet } from '../src/snapshot.ts'
import { buildStaticSite, sitePreviewResponse } from '../src/project.ts'
import { SiteRevisionId, type SiteProject } from '../src/types.ts'

const project: SiteProject = {
  framework: 'static', files: [
    { path: 'index.html', content: '<!doctype html><title>Studio</title><button id="count">0</button><script src="app.js"></script>', encoding: 'utf8' },
    { path: 'app.js', content: "document.getElementById('count').onclick = event => { event.target.textContent = Number(event.target.textContent) + 1 }", encoding: 'utf8' },
    { path: 'assets/logo.png', content: 'AAECAw==', encoding: 'base64' },
  ],
}

describe('site source projects', () => {
  it('restores a store-independent project after SQLite restart with binary assets and historical content intact', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-project-'))
    let storage: SqliteSiteStateStore | undefined
    try {
      storage = new SqliteSiteStateStore(join(directory, 'sites.sqlite'))
      const sites = new InMemorySiteService(new Context(), undefined, storage)
      const site = sites.createSite(TenantId('owner'), 'Studio')
      expect(site.connectionId).toBeUndefined()
      const spec = { tenantId: site.tenantId, siteId: site.id }
      const first = await sites.createRevision(spec, { project }, 'agent')
      await expect(sites.createRevision(spec, { project }, 'agent')).rejects.toThrow('revision conflict')
      const edited: SiteProject = { ...project, files: [{ path: 'index.html', content: '<h1>Updated</h1>', encoding: 'utf8' }] }
      const second = await sites.createRevision(spec, { project: edited, baseRevisionId: first.id }, 'user')
      expect(sites.diff(spec, second.id, first.id).files).toEqual({ added: [], removed: ['app.js', 'assets/logo.png'], changed: ['index.html'], frameworkChanged: false })
      const rollback = await sites.rollback(spec, first.id)
      storage.close()
      storage = new SqliteSiteStateStore(join(directory, 'sites.sqlite'))
      const restored = new InMemorySiteService(new Context(), undefined, storage)
      expect(restored.content(spec, rollback.id).project).toEqual(project)
      expect(restored.content(spec, second.id).project).toEqual(edited)
      expect(restored.build(spec, first.id).files.find(file => file.path.endsWith('.png'))?.base64).toBe('AAECAw==')
      expect(() => restored.build({ ...spec, tenantId: TenantId('foreign') }, first.id)).toThrow('tenant')
    } finally {
      storage?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('builds deterministic artifacts and leaves host code unexecuted', async () => {
    const revisionId = SiteRevisionId('reviewed-revision')
    const first = buildStaticSite(revisionId, project)
    const reordered = buildStaticSite(revisionId, { ...project, files: [...project.files].reverse() })
    expect(first).toEqual(reordered)
    const html = sitePreviewResponse(first, '/')
    expect(await html.text()).toBe(project.files[0]!.content)
    expect(html.headers.get('content-security-policy')).toContain('sandbox allow-scripts;')
    expect(html.headers.get('content-security-policy')).not.toContain('allow-same-origin')
    expect(html.headers.get('cache-control')).toContain('no-store')
    const binary = sitePreviewResponse(first, '/assets/logo.png')
    expect([...new Uint8Array(await binary.arrayBuffer())]).toEqual([0, 1, 2, 3])
    expect(binary.headers.get('content-type')).toBe('image/png')
    expect(sitePreviewResponse(first, '/missing').status).toBe(404)
    expect(sitePreviewResponse(first, '/../index.html').status).toBe(404)
    expect(() => buildStaticSite(revisionId, { framework: 'nextjs', files: [] })).toThrow('isolated framework build')
    expect(() => buildStaticSite(revisionId, { framework: 'static', files: [] })).toThrow('index.html')
  })

  it.each(['../outside', '/absolute', 'C:/absolute', 'a\\b', 'a//b', 'a/./b', 'a./b', 'a /b', 'NUL.txt', '.env', '.env.production', '.git/config', 'nested/.npmrc', 'a%2fb', 'bad\u0000path'])('rejects unsafe project path %j at the JSON boundary', path => {
    expect(() => parseSiteChangeSet({ project: { framework: 'static', files: [{ path, content: '', encoding: 'utf8' }] } })).toThrow()
  })

  it('rejects malformed bytes, unknown frameworks, portable path collisions and file parents', () => {
    const parse = (files: unknown[]) => parseSiteChangeSet({ project: { framework: 'static', files } })
    expect(() => parse([{ path: 'logo.png', content: '!!!', encoding: 'base64' }])).toThrow('base64')
    expect(() => parse([{ path: 'index.html', content: '\ud800', encoding: 'utf8' }])).toThrow('Unicode')
    expect(() => parse([{ path: 'index.html', content: 1, encoding: 'utf8' }])).toThrow()
    expect(() => parse([{ path: 'index.html', content: '', encoding: 'hex' }])).toThrow()
    expect(() => parse(['file'])).toThrow()
    expect(() => parseSiteChangeSet({ project: { framework: 'unknown', files: [] } })).toThrow()
    expect(() => parse(['index.html', 'INDEX.html'].map(path => ({ path, content: '', encoding: 'utf8' })))).toThrow('duplicate')
    expect(() => parse(['assets', 'assets/logo.png'].map(path => ({ path, content: '', encoding: 'utf8' })))).toThrow('parent')
  })
})
