/** Exact publication, durable retries and intake limits run in isolated databases without external services. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { SiteLocal, siteLocalConfig } from '../src/site-local.ts'
import { siteEditor } from '../src/site-editor.ts'
import { installSiteSystem } from './site-system-fixture.ts'
import { companySiteReview } from '../src/site-company-source.ts'
import { profileSchema } from '../src/schema.ts'

const tenantId = TenantId('enterprise')
const project = { framework: 'static' as const, files: [{ path: 'index.html', encoding: 'utf8' as const, content: '<h1>First version</h1><a href="/contact/">Contact</a>' }, { path: 'contact/index.html', encoding: 'utf8' as const, content: '<h1>Contact</h1>' }] }
const body = { requestId: 'a'.repeat(32), name: 'Buyer', email: 'buyer@example.test', company: 'Example', product: 'Part', message: 'Please quote this drawing.', consent: true, website: '' }
const request = (path = '/', input?: unknown) => new Request(`http://127.0.0.1:3000${path}`, input === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })

describe('self-hosted Sites', () => {
  it('serves only confirmed compiled pages and keeps publication stable through edits, failure and restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-local-'))
    const ctx = new Context()
    let local: SiteLocal | undefined
    try {
      const sites = new InMemorySiteService(ctx)
      const site = sites.createSiteWithProject(tenantId, 'Company', project, 'user')
      const spec = { tenantId, siteId: site.id }
      const path = join(directory, 'local.sqlite')
      local = new SiteLocal(path, sites, siteLocalConfig.parse({}))
      expect((await local.fetch(spec, '/', request())).status).toBe(404)
      const review = await local.prepare(spec, site.currentRevisionId!)
      expect(local.state(spec).online).toBe(false)
      local.publish(spec, { ...review, confirmed: true })
      const response = await local.fetch(spec, '/', request())
      expect(await response.text()).toContain(`/sites-live/${site.id}/contact/`)
      expect(response.headers.get('content-security-policy')).toContain('sandbox allow-scripts allow-forms;')
      expect(response.headers.get('content-security-policy')).not.toContain('allow-same-origin')
      expect((await local.fetch(spec, '/site.template.json', request())).status).toBe(404)
      const next = await sites.createRevision(spec, { baseRevisionId: site.currentRevisionId!, project: { framework: 'static', files: [{ path: 'index.html', content: '<h1>Broken revision</h1><script src="/missing.js"></script>', encoding: 'utf8' }] } }, 'user')
      await expect(local.prepare(spec, next.id)).rejects.toThrow('missing')
      expect(await (await local.fetch(spec, '/', request())).text()).toContain('First version')
      expect(() => local!.publish(spec, { ...review, confirmed: true })).toThrow('Publication changed')
      local.close(); local = new SiteLocal(path, sites, siteLocalConfig.parse({}))
      expect(local.state(spec).revisionId).toBe(site.currentRevisionId)
      local.offline(spec, local.state(spec).generation)
      expect((await local.fetch(spec, '/', request())).status).toBe(404)
      expect((await local.fetch(spec, '/_inquiries', request('/', body))).status).toBe(404)
    } finally { local?.close(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) }
  })
  it('commits inquiries once, isolates inboxes and enforces content, storage and rate limits', async () => {
    const ctx = new Context()
    const sites = new InMemorySiteService(ctx)
    const site = sites.createSiteWithProject(tenantId, 'Company', project, 'user')
    const other = sites.createSiteWithProject(tenantId, 'Other', project, 'user')
    const spec = { tenantId, siteId: site.id }
    const local = new SiteLocal(':memory:', sites, siteLocalConfig.parse({ maxInquiriesPerHour: 1, maxStoredInquiries: 1, maxInquiryBytes: 1024 }))
    try {
      local.publish(spec, { ...await local.prepare(spec, site.currentRevisionId!), confirmed: true })
      const first = await local.fetch(spec, '/_inquiries', request('/', body))
      expect(first.status).toBe(201)
      const receipt = await first.json() as { id: string }
      const retry = await local.fetch(spec, '/_inquiries', request('/', body))
      expect(retry.status).toBe(200)
      expect(await retry.json()).toEqual({ id: receipt.id, status: 'received' })
      expect((await local.fetch(spec, '/_inquiries', request('/', { ...body, message: 'Different retry content' }))).status).toBe(409)
      expect((await local.fetch(spec, '/_inquiries', request('/', { ...body, consent: false }))).status).toBe(400)
      expect((await local.fetch(spec, '/_inquiries', request('/', { ...body, website: 'spam' }))).status).toBe(400)
      expect((await local.fetch(spec, '/_inquiries', request('/', { ...body, message: 'x'.repeat(2048) }))).status).toBe(413)
      expect((await local.fetch(spec, '/_inquiries', request('/', { ...body, requestId: 'b'.repeat(32) }))).status).toBe(429)
      expect(local.inbox(spec).total).toBe(1)
      expect(local.inbox({ tenantId, siteId: other.id }).total).toBe(0)
      expect(() => local.updateInquiry({ tenantId, siteId: other.id }, { id: receipt.id, action: 'read' })).toThrow('not found')
      local.updateInquiry(spec, { id: receipt.id, action: 'read' })
      expect(local.inbox(spec).items[0]?.status).toBe('read')
      local.updateInquiry(spec, { id: receipt.id, action: 'close' })
      expect(local.inbox(spec).items[0]?.status).toBe('closed')
      local.updateInquiry(spec, { id: receipt.id, action: 'delete' })
      expect(local.inbox(spec).total).toBe(0)
      expect((await local.fetch(spec, '/_inquiries', new Request('http://localhost/', { method: 'OPTIONS' }))).status).toBe(204)
      expect((await local.fetch(spec, '/_inquiries', request())).status).toBe(405)
      let stream!: ReadableStreamDefaultController<Uint8Array>
      const pendingBody = new ReadableStream<Uint8Array>({ start(controller) { stream = controller } })
      const init: RequestInit & { duplex: 'half' } = { method: 'POST', headers: { 'content-type': 'application/json' }, body: pendingBody, duplex: 'half' }
      const receiving = local.fetch(spec, '/_inquiries', new Request('http://localhost/', init))
      local.offline(spec, local.state(spec).generation)
      stream.enqueue(new TextEncoder().encode(JSON.stringify({ ...body, requestId: 'c'.repeat(32) }))); stream.close()
      expect((await receiving).status).toBe(404)
      expect(local.inbox(spec).total).toBe(0)
    } finally { local.close(); await ctx.fiber.dispose() }
  })
  it('checks a fresh company projection and retains drafts, publication and inquiries after reopening the editor', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-company-editor-'))
    let ctx = new Context()
    const profile = profileSchema.parse({ name: 'Live company', kind: 'enterprise', description: 'Actual profile details', business: 'Parts', website: '', email: 'sales@example.test', contact: '', phone: '', address: '', logoId: null })
    let current = profile
    const review = () => companySiteReview(current, [], 'local', new Date())
    installSiteSystem(ctx)
    let editor = siteEditor(ctx, directory, undefined, async () => {}, 1048576, undefined, review)
    const call = (query: string, data?: unknown) => editor.fetch(request(`/api/enterprise/sites?${query}`, data), '/sites')
    try {
      const source = await (await call('action=company-source')).json() as { digest: string }
      current = { ...profile, email: 'updated@example.test' }
      expect((await call('action=company-create', { digest: source.digest, style: 'precision', confirmed: true })).status).toBe(409)
      const fresh = await (await call('action=company-source')).json() as { digest: string }
      const created = await call('action=company-create', { digest: fresh.digest, style: 'precision', confirmed: true })
      expect(created.status).toBe(201)
      const site = await created.json() as { id: string; currentRevisionId: string }
      const staged = await (await call(`action=local-review&siteId=${site.id}&revisionId=${site.currentRevisionId}`)).json() as Record<string, unknown>
      const command = { revisionId: staged.revisionId, digest: staged.digest, expectedGeneration: staged.expectedGeneration, confirmed: true }
      expect((await call(`action=local-publish&siteId=${site.id}`, command)).status).toBe(200)
      const received = await editor.publicFetch(request(`/sites-live/${site.id}/_inquiries`, body))
      expect(received.status).toBe(201)
      await editor.close(); await ctx.fiber.dispose(); ctx = new Context()
      installSiteSystem(ctx)
      editor = siteEditor(ctx, directory, undefined, async () => {}, 1048576, undefined, review)
      expect((await editor.publicFetch(request(`/sites-live/${site.id}/`))).status).toBe(200)
      expect(await (await call(`action=inbox&siteId=${site.id}`)).json()).toMatchObject({ total: 1 })
      expect((await call(`action=local-publish&siteId=${site.id}`, command)).status).toBe(409)
      expect((await editor.publicFetch(request(`/sites-live/${site.id}/site.template.json`))).status).toBe(404)
      expect((await call(`action=manage&siteId=${site.id}`, { archived: true, expectedVersion: 0, confirmed: true })).status).toBe(409)
      const online = await (await call(`action=local&siteId=${site.id}`)).json() as { generation: number }
      expect((await call(`action=local-offline&siteId=${site.id}`, { expectedGeneration: online.generation, confirmed: true })).status).toBe(200)
      expect((await call(`action=manage&siteId=${site.id}`, { archived: true, expectedVersion: 0, confirmed: true })).status).toBe(200)
      expect((await call(`action=delete&siteId=${site.id}`, { expectedVersion: 1, confirmed: true })).status).toBe(200)
      expect((await editor.publicFetch(request(`/sites-live/${site.id}/`))).status).toBe(404)
      expect((await call(`siteId=${site.id}`)).status).toBe(404)
    } finally { await editor.close(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) }
  })
})
