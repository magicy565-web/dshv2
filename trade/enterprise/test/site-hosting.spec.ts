/** Durable hosting jobs publish reviewed builds without depending on the latest draft. */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { SiteHosting } from '../src/site-hosting.ts'
import { SiteHostingStore } from '../src/site-hosting-store.ts'
import type { HostingBuildId, HostingProjectId, SiteDeploymentId } from '../src/site-hosting-schema.ts'
import { HostingRejected, type SiteHostingProvider } from '../src/site-hosting-provider.ts'
import { siteEditor } from '../src/site-editor.ts'
import { hostingStateSchema } from '../src/site-hosting-schema.ts'
import { siteDomainName, type SiteDomain } from '../src/site-domains-schema.ts'
import { siteTools } from '../src/site-tools.ts'
import type { ToolExecution, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const signal = new AbortController().signal
const project = { framework: 'static' as const, files: [{ path: 'index.html', content: '<h1>Studio</h1>', encoding: 'utf8' as const }] }

async function fixture(path = ':memory:') {
  const context = new Context()
  cleanups.push(() => context.fiber.dispose())
  const sites = new InMemorySiteService(context)
  const site = sites.createSite(TenantId('owner'), 'Studio')
  const spec = { tenantId: site.tenantId, siteId: site.id }
  const revision = await sites.createRevision(spec, { project }, 'agent')
  const store = new SiteHostingStore(path)
  cleanups.push(() => store.close())
  let live: HostingBuildId | undefined
  let paused = false
  let buildCount = 0
  const promotions: { buildId: HostingBuildId; rollback: boolean }[] = []
  const provider: SiteHostingProvider = {
    createProject: async () => 'project-one' as HostingProjectId,
    stage: async () => ({ id: `build-${++buildCount}` as HostingBuildId, status: 'building', previewUrl: 'https://preview.vercel.app' }),
    inspect: async (_project, id) => ({ id, status: 'ready', previewUrl: 'https://preview.vercel.app' }),
    recover: async () => undefined,
    promote: async (_project, buildId, rollback) => { promotions.push({ buildId, rollback }) },
    production: async () => live ? { buildId: live, url: 'https://studio.example', paused } : undefined,
    setPaused: async (_projectId, value) => { paused = value },
    domains: async () => [],
    changeDomain: async () => {},
  }
  const hosting = new SiteHosting(sites, store, provider)
  return { sites, spec, revision, hosting, provider, store, promotions, setLive: (value: HostingBuildId) => { live = value }, builds: () => buildCount }
}

describe('independent Sites publication', () => {
  it('previews a Next.js revision through the isolated builder and polls the same deployment without publishing', async () => {
    const f = await fixture()
    const next = await f.sites.createRevision(f.spec, { baseRevisionId: f.revision.id, project: { framework: 'nextjs', files: [{ path: 'package.json', content: '{"dependencies":{"next":"fixture"}}', encoding: 'utf8' }] } }, 'agent')
    const args = { siteId: f.spec.siteId, revisionId: next.id }
    const execution: ToolExecution = { signal, name: 'site_preview', arguments: args, callId: ToolCallId('preview'), rootCallId: ToolCallId('preview'), token: Symbol('preview') as ToolExecutionToken }
    const tools = siteTools(f.sites, f.spec.tenantId, 10000, f.hosting)
    const preview = tools.find(tool => tool.name === 'site_preview')!
    const submitted = await preview.execute(args, execution)
    expect(submitted).toMatchObject({ kind: 'cloud', revisionId: next.id, status: 'building' })
    expect(submitted).not.toHaveProperty('previewUrl')
    f.provider.domains = async () => { throw new Error('DNS unavailable') }
    f.provider.production = async () => { throw new Error('Production status unavailable') }
    const ready = await preview.execute(args, execution)
    expect(ready).toMatchObject({ status: 'ready', revisionId: next.id, previewUrl: 'https://preview.vercel.app' })
    expect(await preview.execute(args, execution)).toEqual(ready)
    expect(f.builds()).toBe(1)
    expect(f.promotions).toEqual([])
    expect(f.hosting.get(f.spec).liveDeploymentId).toBeUndefined()
    const absent = siteTools(f.sites, f.spec.tenantId, 10000).find(tool => tool.name === 'site_preview')!
    await expect(absent.execute(args, execution)).rejects.toThrow('requires configured independent hosting')
    await expect(preview.execute({ ...args, tenantId: 'another' }, execution)).rejects.toThrow()
  })

  it('does not resubmit a failed or uncertain Next.js preview and forwards cancellation to its provider', async () => {
    const f = await fixture()
    const next = await f.sites.createRevision(f.spec, { baseRevisionId: f.revision.id, project: { framework: 'nextjs', files: [] } }, 'agent')
    const args = { siteId: f.spec.siteId, revisionId: next.id }
    const controller = new AbortController()
    const execution: ToolExecution = { signal: controller.signal, name: 'site_preview', arguments: args, callId: ToolCallId('preview'), rootCallId: ToolCallId('preview'), token: Symbol('preview') as ToolExecutionToken }
    const preview = siteTools(f.sites, f.spec.tenantId, 10000, f.hosting).find(tool => tool.name === 'site_preview')!
    let submissions = 0
    f.provider.stage = async (_project, _input, received) => {
      expect(received).toBe(controller.signal)
      submissions++
      throw new HostingRejected('Build configuration rejected')
    }
    expect(await preview.execute(args, execution)).toMatchObject({ status: 'failed', error: 'Build configuration rejected' })
    expect(await preview.execute(args, execution)).toMatchObject({ status: 'failed' })
    expect(submissions).toBe(1)
    const corrected = await f.sites.createRevision(f.spec, { baseRevisionId: next.id, project: { framework: 'nextjs', files: [{ path: 'package.json', content: '{}', encoding: 'utf8' }] } }, 'agent')
    f.provider.stage = async (_project, _input, received) => {
      submissions++
      controller.abort()
      received.throwIfAborted()
      throw new Error('Unreachable')
    }
    expect(await preview.execute({ ...args, revisionId: corrected.id }, execution)).toMatchObject({ status: 'unknown' })
    const recoveredExecution = { ...execution, signal }
    expect(await preview.execute({ ...args, revisionId: corrected.id }, recoveredExecution)).toMatchObject({ status: 'unknown' })
    expect(submissions).toBe(2)
    expect(f.promotions).toEqual([])
  })

  it('persists failed build diagnostics and retries unavailable logs without resubmitting source', async () => {
    const f = await fixture()
    const next = await f.sites.createRevision(f.spec, { baseRevisionId: f.revision.id, project: { framework: 'nextjs', files: [{ path: 'package.json', content: '{}', encoding: 'utf8' }] } }, 'agent')
    await f.hosting.stage(f.spec, next.id, signal)
    const id = f.hosting.get(f.spec).deployments[0]!.id
    let inspections = 0
    f.provider.inspect = async (_project, buildId) => {
      inspections++
      return { id: buildId, status: 'failed', previewUrl: 'https://preview.vercel.app', error: 'Compilation failed', ...(inspections > 1 ? { buildLog: 'app/page.tsx:3: module not found' } : {}) }
    }
    const failed = await f.hosting.refreshDeployment(f.spec, id, signal)
    expect(failed.deployments[0]).toMatchObject({ status: 'failed', error: 'Compilation failed' })
    expect(failed.deployments[0]?.buildLog).toBeUndefined()
    const resumed = new SiteHosting(f.sites, f.store, f.provider)
    const diagnosed = await resumed.refreshDeployment(f.spec, id, signal)
    expect(diagnosed.deployments[0]?.buildLog).toBe('app/page.tsx:3: module not found')
    expect(await resumed.refreshDeployment(f.spec, id, signal)).toEqual(diagnosed)
    expect(inspections).toBe(2)
    expect(f.builds()).toBe(1)
    const args = { siteId: f.spec.siteId, revisionId: next.id }
    const execution: ToolExecution = { signal, name: 'site_preview', arguments: args, callId: ToolCallId('diagnose'), rootCallId: ToolCallId('diagnose'), token: Symbol('diagnose') as ToolExecutionToken }
    const preview = siteTools(f.sites, f.spec.tenantId, 10000, resumed).find(tool => tool.name === 'site_preview')!
    const result = await preview.execute(args, execution)
    expect(result).toMatchObject({ status: 'failed', error: 'Compilation failed', buildLog: 'app/page.tsx:3: module not found' })
    expect(result).not.toHaveProperty('previewUrl')
  })

  it('stages once, publishes the reviewed build despite later edits, and confirms routing before declaring it live', async () => {
    const f = await fixture()
    const first = await f.hosting.stage(f.spec, f.revision.id, signal)
    await f.hosting.stage(f.spec, f.revision.id, signal)
    expect(f.builds()).toBe(1)
    const deployment = first.deployments[0]!
    const approval = { deploymentId: deployment.id, digest: deployment.digest, expectedLiveDeploymentId: null }
    await expect(f.hosting.publish(f.spec, approval, signal)).rejects.toThrow('not ready')
    await f.hosting.refresh(f.spec, signal)
    await f.sites.createRevision(f.spec, { baseRevisionId: f.revision.id, project: { ...project, files: [{ ...project.files[0]!, content: '<h1>Different draft</h1>' }] } }, 'agent')
    await expect(f.hosting.publish(f.spec, { ...approval, digest: '0'.repeat(64) }, signal)).rejects.toThrow('reviewed version')
    const pending = await f.hosting.publish(f.spec, approval, signal)
    expect(pending.liveDeploymentId).toBeUndefined()
    expect(pending.pendingPromotionId).toBe(deployment.id)
    expect(f.promotions).toEqual([{ buildId: deployment.buildId, rollback: false }])
    await expect(f.hosting.publish(f.spec, approval, signal)).rejects.toThrow('pending')
    f.setLive(deployment.buildId!)
    const resumed = new SiteHosting(f.sites, f.store, f.provider)
    const confirmed = await resumed.refresh(f.spec, signal)
    expect(confirmed.liveDeploymentId).toBe(deployment.id)
    expect(confirmed.pendingPromotionId).toBeUndefined()
    expect(confirmed.deployments[0]?.published).toBe(true)
    expect(f.sites.get(f.spec)?.currentRevisionId).not.toBe(f.revision.id)
  })

  it('restores a previously published build without rebuilding it', async () => {
    const f = await fixture()
    await f.hosting.stage(f.spec, f.revision.id, signal)
    const first = (await f.hosting.refresh(f.spec, signal)).deployments[0]!
    f.setLive(first.buildId!)
    await f.hosting.refresh(f.spec, signal)
    const revision = await f.sites.createRevision(f.spec, { baseRevisionId: f.revision.id, project }, 'user')
    await f.hosting.stage(f.spec, revision.id, signal)
    const second = (await f.hosting.refresh(f.spec, signal)).deployments[0]!
    f.setLive(second.buildId!)
    await f.hosting.refresh(f.spec, signal)
    await f.hosting.publish(f.spec, { deploymentId: first.id, digest: first.digest, expectedLiveDeploymentId: second.id }, signal)
    expect(f.promotions).toEqual([{ buildId: first.buildId, rollback: true }])
    expect(f.builds()).toBe(2)
  })

  it('allows another review after rejected promotion but retains uncertainty after a lost response', async () => {
    const f = await fixture()
    await f.hosting.stage(f.spec, f.revision.id, signal)
    const deployment = (await f.hosting.refresh(f.spec, signal)).deployments[0]!
    const approval = { deploymentId: deployment.id, digest: deployment.digest, expectedLiveDeploymentId: null }
    f.provider.promote = async () => { throw new HostingRejected('Access denied') }
    const rejected = await f.hosting.publish(f.spec, approval, signal)
    expect(rejected.pendingPromotionId).toBeUndefined()
    expect(rejected.operationError).toBe('Access denied')
    f.provider.promote = async () => { f.setLive(deployment.buildId!); throw new Error('response lost') }
    await expect(f.hosting.publish(f.spec, approval, signal)).rejects.toThrow('response lost')
    expect(f.hosting.get(f.spec).pendingPromotionId).toBe(deployment.id)
    expect(f.hosting.get(f.spec).operationError).toBeUndefined()
    const recovered = await new SiteHosting(f.sites, f.store, f.provider).refresh(f.spec, signal)
    expect(recovered.liveDeploymentId).toBe(deployment.id)
    expect(recovered.pendingPromotionId).toBeUndefined()
  })

  it('persists confirmed production availability even when domain discovery fails', async () => {
    const f = await fixture()
    await f.hosting.stage(f.spec, f.revision.id, signal)
    const deployment = (await f.hosting.refresh(f.spec, signal)).deployments[0]!
    f.setLive(deployment.buildId!)
    await f.hosting.refresh(f.spec, signal)
    await f.hosting.changeAvailability(f.spec, { paused: true, expectedLiveDeploymentId: deployment.id }, signal)
    f.provider.domains = async () => { throw new Error('DNS service unavailable') }
    await expect(f.hosting.refresh(f.spec, signal)).rejects.toThrow('DNS service unavailable')
    const recovered = new SiteHosting(f.sites, f.store, f.provider).get(f.spec)
    expect(recovered.availability).toBe('offline')
    expect(recovered.pendingAvailability).toBeUndefined()
    expect(recovered.liveDeploymentId).toBe(deployment.id)
  })

  it('preserves uncertain submissions and checks tenant ownership before remote work', async () => {
    const f = await fixture()
    f.provider.stage = async () => { throw new Error('Network failed after remote acceptance') }
    const state = await f.hosting.stage(f.spec, f.revision.id, signal)
    expect(state.deployments[0]?.status).toBe('unknown')
    await expect(f.hosting.stage(f.spec, f.revision.id, signal)).rejects.toThrow('Reconcile')
    expect(() => f.hosting.get({ ...f.spec, tenantId: TenantId('intruder') })).toThrow('tenant')
    await expect(f.hosting.refresh({ ...f.spec, tenantId: TenantId('intruder') }, signal)).rejects.toThrow('tenant')
    expect(() => new SiteHosting(f.sites, f.store).get(f.spec)).not.toThrow()
    await expect(new SiteHosting(f.sites, f.store).stage(f.spec, f.revision.id, signal)).rejects.toThrow('not configured')
  })

  it('excludes concurrent remote mutations and refuses provider-side production drift', async () => {
    const f = await fixture()
    let release!: () => void
    let entered!: () => void
    const active = new Promise<void>(resolve => { entered = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    const stage = f.provider.stage
    f.provider.stage = async (...args) => { entered(); await barrier; return stage(...args) }
    const first = f.hosting.stage(f.spec, f.revision.id, signal)
    await active
    try { await expect(f.hosting.stage(f.spec, f.revision.id, signal)).rejects.toThrow('already active') }
    finally { release() }
    await first
    const deployment = (await f.hosting.refresh(f.spec, signal)).deployments[0]!
    f.setLive('foreign-build' as HostingBuildId)
    await expect(f.hosting.publish(f.spec, { deploymentId: deployment.id, digest: deployment.digest, expectedLiveDeploymentId: null }, signal)).rejects.toThrow('changed at the hosting provider')
    expect(f.promotions).toEqual([])
  })

  it('recovers an accepted submission after its response is lost without creating a second build', async () => {
    const f = await fixture()
    f.provider.stage = async () => { throw new Error('response lost') }
    const interrupted = await f.hosting.stage(f.spec, f.revision.id, signal)
    const original = interrupted.deployments[0]!
    f.provider.recover = async (_project, input) => {
      expect(input.id).toBe(original.id)
      expect(input.digest).toBe(original.digest)
      return { id: 'accepted-build' as HostingBuildId, status: 'ready', previewUrl: 'https://preview.vercel.app' }
    }
    const recovered = await new SiteHosting(f.sites, f.store, f.provider).refresh(f.spec, signal)
    expect(recovered.deployments).toHaveLength(1)
    expect(recovered.deployments[0]).toMatchObject({ id: original.id, status: 'ready', buildId: 'accepted-build' })
    expect(recovered.deployments[0]?.error).toBeUndefined()
  })

  it('allows a new attempt after the provider explicitly rejects a submission', async () => {
    const f = await fixture()
    const stage = f.provider.stage
    f.provider.stage = async () => { throw new HostingRejected('Project exceeds the upload limit') }
    expect((await f.hosting.stage(f.spec, f.revision.id, signal)).deployments[0]?.status).toBe('failed')
    f.provider.stage = stage
    expect((await f.hosting.stage(f.spec, f.revision.id, signal)).deployments[0]?.status).toBe('building')
    expect(f.builds()).toBe(1)
  })

  it('pauses and restores the reviewed production deployment without rebuilding or deleting history', async () => {
    const f = await fixture()
    await f.hosting.stage(f.spec, f.revision.id, signal)
    const first = (await f.hosting.refresh(f.spec, signal)).deployments[0]!
    f.setLive(first.buildId!)
    expect((await f.hosting.refresh(f.spec, signal)).availability).toBe('online')
    await expect(f.hosting.changeAvailability(f.spec, { paused: true, expectedLiveDeploymentId: crypto.randomUUID() as SiteDeploymentId }, signal)).rejects.toThrow('Refresh production')
    const pending = await f.hosting.changeAvailability(f.spec, { paused: true, expectedLiveDeploymentId: first.id }, signal)
    expect(pending.availability).toBe('online')
    expect(pending.pendingAvailability?.paused).toBe(true)
    await expect(f.hosting.publish(f.spec, { deploymentId: first.id, digest: first.digest, expectedLiveDeploymentId: first.id }, signal)).rejects.toThrow('pending')
    const offline = await new SiteHosting(f.sites, f.store, f.provider).refresh(f.spec, signal)
    expect(offline.availability).toBe('offline')
    expect(offline.pendingAvailability).toBeUndefined()
    expect(offline.liveDeploymentId).toBe(first.id)
    await expect(f.hosting.publish(f.spec, { deploymentId: first.id, digest: first.digest, expectedLiveDeploymentId: first.id }, signal)).rejects.toThrow('Resume')
    await f.hosting.changeAvailability(f.spec, { paused: false, expectedLiveDeploymentId: first.id }, signal)
    const restored = await f.hosting.refresh(f.spec, signal)
    expect(restored.availability).toBe('online')
    expect(restored.deployments).toEqual(offline.deployments)
    expect(f.builds()).toBe(1)
  })

  it('reconciles an accepted pause after a lost response and allows retry after an explicit rejection', async () => {
    const f = await fixture()
    await f.hosting.stage(f.spec, f.revision.id, signal)
    const first = (await f.hosting.refresh(f.spec, signal)).deployments[0]!
    f.setLive(first.buildId!)
    await f.hosting.refresh(f.spec, signal)
    const pause = f.provider.setPaused
    f.provider.setPaused = async () => { throw new HostingRejected('Access denied') }
    const rejected = await f.hosting.changeAvailability(f.spec, { paused: true, expectedLiveDeploymentId: first.id }, signal)
    expect(rejected.pendingAvailability).toBeUndefined()
    expect(rejected.operationError).toBe('Access denied')
    f.provider.setPaused = async (...args) => { await pause(...args); throw new Error('response lost') }
    await expect(f.hosting.changeAvailability(f.spec, { paused: true, expectedLiveDeploymentId: first.id }, signal)).rejects.toThrow('response lost')
    expect(f.hosting.get(f.spec).pendingAvailability?.paused).toBe(true)
    const recovered = await new SiteHosting(f.sites, f.store, f.provider).refresh(f.spec, signal)
    expect(recovered.availability).toBe('offline')
    expect(recovered.pendingAvailability).toBeUndefined()
    expect(recovered.operationError).toBeUndefined()
  })

  it('attaches, verifies and removes only the reviewed domain, retaining pending mutations across restarts', async () => {
    const f = await fixture()
    await f.hosting.stage(f.spec, f.revision.id, signal)
    const name = siteDomainName.parse('www.example.com')
    let domains: SiteDomain[] = []
    f.provider.domains = async () => domains
    f.provider.changeDomain = async (_project, operation) => {
      if (operation === 'add') domains = [{ name, verified: false, configured: false, managed: false, dns: [] }]
      if (operation === 'verify') domains = domains.map(domain => ({ ...domain, verified: true, configured: true }))
      if (operation === 'remove') domains = []
    }
    const observed = f.hosting.get(f.spec)
    await expect(f.hosting.changeDomain(f.spec, { operation: 'add', name, expectedGeneration: observed.generation - 1 }, signal)).rejects.toThrow('Refresh hosting')
    const attached = await f.hosting.changeDomain(f.spec, { operation: 'add', name, expectedGeneration: observed.generation }, signal)
    expect(attached.pendingDomain?.name).toBe(name)
    await expect(f.hosting.stage(f.spec, f.revision.id, signal)).rejects.toThrow('Reconcile')
    const reconciled = await new SiteHosting(f.sites, f.store, f.provider).refresh(f.spec, signal)
    expect(reconciled.pendingDomain).toBeUndefined()
    expect(reconciled.domains?.[0]).toMatchObject({ name, verified: false })
    await f.hosting.changeDomain(f.spec, { operation: 'verify', name, expectedGeneration: reconciled.generation }, signal)
    const verified = await f.hosting.refresh(f.spec, signal)
    expect(verified.domains?.[0]?.verified).toBe(true)
    const remove = f.provider.changeDomain
    f.provider.changeDomain = async (...args) => { await remove(...args); throw new Error('response lost') }
    await expect(f.hosting.changeDomain(f.spec, { operation: 'remove', name, expectedGeneration: verified.generation }, signal)).rejects.toThrow('response lost')
    expect(f.hosting.get(f.spec).pendingDomain?.operation).toBe('remove')
    const removed = await new SiteHosting(f.sites, f.store, f.provider).refresh(f.spec, signal)
    expect(removed.domains).toEqual([])
    expect(removed.pendingDomain).toBeUndefined()
    expect(f.builds()).toBe(1)
  })

  it('rejects stale SQLite writers and retains hosting records when reopened', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-hosting-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
    const filename = join(dir, 'hosting.sqlite')
    const f = await fixture(filename)
    const stale = f.store.get(f.spec.siteId)
    const staged = await f.hosting.stage(f.spec, f.revision.id, signal)
    const other = new SiteHostingStore(filename)
    cleanups.push(() => other.close())
    expect(other.get(f.spec.siteId)).toEqual(staged)
    expect(() => other.put(stale)).toThrow('another writer')
    expect(() => hostingStateSchema.parse({ ...staged, liveDeploymentId: crypto.randomUUID() })).toThrow('published build')
    expect(() => hostingStateSchema.parse({ ...staged, pendingPromotionId: staged.deployments[0]?.id })).toThrow('ready build')
    expect(() => hostingStateSchema.parse({ ...staged, projectId: undefined })).toThrow('metadata is missing')
    expect(() => hostingStateSchema.parse({ ...staged, deployments: [...staged.deployments, ...staged.deployments] })).toThrow('Duplicate')
    expect(() => hostingStateSchema.parse({ ...staged, productionUrl: 'javascript:alert(1)' })).toThrow('HTTPS')
    expect(() => hostingStateSchema.parse({ ...staged, productionUrl: 'https://secret@website.example' })).toThrow('credentials')
  })

  it('requires browser confirmation and an exact digest at the authenticated HTTP adapter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-hosting-http-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
    const context = new Context()
    cleanups.push(() => context.fiber.dispose())
    const editor = siteEditor(context, dir, undefined, async () => {}, 10000)
    cleanups.push(() => editor.close())
    const request = (query: string, value?: unknown) => editor.fetch(new Request(`https://workspace.test/api/enterprise/sites?${query}`, { method: value === undefined ? 'GET' : 'POST', ...(value === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }) }), '/sites')
    const site = await (await request('', { name: 'Website' })).json()
    expect((await (await request(`siteId=${site.id}&action=hosting`)).json()).configured).toBe(false)
    expect((await request(`siteId=${site.id}&action=hosting-publish`, { deploymentId: crypto.randomUUID(), digest: '0'.repeat(64), expectedLiveDeploymentId: null })).status).toBe(400)
    expect((await request(`siteId=${crypto.randomUUID()}&action=hosting`)).status).toBe(404)
  })
})
