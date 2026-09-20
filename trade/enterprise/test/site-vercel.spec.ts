/** Vercel wire tests keep credentials out of generated projects and preserve protected staging. */
import { describe, expect, it } from 'vitest'
import { vercelHosting } from '../src/site-vercel.ts'
import type { HostingBuildId, HostingProjectId, SiteDeploymentId } from '../src/site-hosting-schema.ts'

const projectId = 'prj_test' as HostingProjectId
const buildId = 'dpl_test' as HostingBuildId
const signal = new AbortController().signal
const config = { token: 'host-only-token', teamId: 'team_test', requestTimeoutMs: 10000, maxResponseBytes: 100000, maxDeploymentBytes: 100000, recoveryPageSize: 100, maxRecoveryPages: 5, maxDomains: 20 }
const project = { id: projectId, name: 'dsh-test', autoAssignCustomDomains: false, ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' } }
const build = { id: buildId, projectId, target: 'production', url: 'preview.vercel.app', readyState: 'READY' }

function fixture(protection = project) {
  const requests: { path: string; method: string; body?: Record<string, unknown> }[] = []
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    expect(url.origin).toBe('https://api.vercel.com')
    expect(url.searchParams.get('teamId')).toBe('team_test')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer host-only-token')
    expect(init?.redirect).toBe('error')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ path: url.pathname, method: init?.method ?? 'GET', body })
    if (url.pathname === '/v13/deployments' && init?.method === 'POST') return Response.json(build)
    if (url.pathname.startsWith('/v13/deployments/')) return Response.json(build)
    if (url.pathname.includes('/promote/') || url.pathname.includes('/rollback/')) return new Response(null, { status: 201 })
    return Response.json(protection)
  }
  return { provider: vercelHosting(config, transport), requests }
}

describe('Vercel Sites provider', () => {
  it('stages static browser assets without executing generated commands or exposing the control-plane token', async () => {
    const f = fixture()
    const result = await f.provider.stage(projectId, {
      id: crypto.randomUUID() as SiteDeploymentId, revisionId: crypto.randomUUID(), digest: '0'.repeat(64),
      project: { framework: 'static', files: [
        { path: 'index.html', content: '<h1>Website</h1><script type="module" src="app.js"></script>', encoding: 'utf8' },
        { path: 'app.js', content: 'document.title = "Built in isolation"', encoding: 'utf8' },
        { path: 'package.json', content: '{"scripts":{"build":"do-not-run"}}', encoding: 'utf8' },
        { path: 'vercel.json', content: '{"alias":"other.example"}', encoding: 'utf8' },
      ] },
    }, signal)
    expect(result).toMatchObject({ id: buildId, status: 'ready', previewUrl: 'https://preview.vercel.app' })
    const payload = f.requests.find(item => item.path === '/v13/deployments')!.body!
    expect(payload.target).toBe('production')
    expect(payload.projectSettings).toEqual({ framework: null, buildCommand: '', installCommand: '', outputDirectory: 'public' })
    const files = payload.files as { file: string; data: string }[]
    expect(files.every(file => file.file.startsWith('public/'))).toBe(true)
    expect(Buffer.from(files.find(file => file.file === 'public/index.html')!.data, 'base64').toString()).toContain('Built in isolation')
    expect(JSON.stringify(payload)).not.toContain('host-only-token')
    expect(f.requests.some(item => item.path.includes('/promote/'))).toBe(false)
  })

  it('rejects unprotected staging and cross-project build responses', async () => {
    const f = fixture({ ...project, ssoProtection: { deploymentType: 'preview' } })
    await expect(f.provider.stage(projectId, { id: crypto.randomUUID() as SiteDeploymentId, revisionId: crypto.randomUUID(), digest: '0'.repeat(64), project: { framework: 'static', files: [] } }, signal)).rejects.toThrow('protect deployment URLs')
    expect(f.requests.some(item => item.path === '/v13/deployments')).toBe(false)
    const provider = vercelHosting(config, async () => Response.json({ ...build, projectId: 'another-project' }))
    await expect(provider.inspect(projectId, buildId, signal)).rejects.toThrow('ownership mismatch')
  })

  it('promotes or rolls back the same build id and resets automatic assignment without another build', async () => {
    const f = fixture()
    await f.provider.promote(projectId, buildId, false, signal)
    await f.provider.promote(projectId, buildId, true, signal)
    expect(f.requests.filter(item => item.method === 'POST').map(item => item.path)).toEqual(['/v10/projects/prj_test/promote/dpl_test', '/v1/projects/prj_test/rollback/dpl_test'])
    expect(f.requests.filter(item => item.method === 'PATCH').map(item => item.body)).toEqual(Array.from({ length: 4 }, () => ({ autoAssignCustomDomains: false })))
  })

  it('does not disclose provider error bodies and bounds successful response bytes', async () => {
    const denied = vercelHosting(config, async () => new Response('secret host-only-token', { status: 403 }))
    await expect(denied.inspect(projectId, buildId, signal)).rejects.toThrow('Hosting API request failed (403)')
    const large = vercelHosting({ ...config, maxResponseBytes: 1 }, async () => Response.json(build))
    await expect(large.inspect(projectId, buildId, signal)).rejects.toThrow('configured limit')
  })

  it('recovers only a matching saved request and digest from the authorized project', async () => {
    const id = crypto.randomUUID() as SiteDeploymentId
    const digest = '0'.repeat(64)
    const paths: string[] = []
    const provider = vercelHosting(config, async input => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      if (url.pathname === '/v7/deployments') {
        expect(url.searchParams.get('projectId')).toBe(projectId)
        return Response.json({ deployments: [{ uid: buildId, projectId, meta: { dshDeploymentId: id, dshSourceDigest: digest } }], pagination: { next: null } })
      }
      return Response.json(build)
    })
    expect((await provider.recover(projectId, { id, digest }, signal))?.id).toBe(buildId)
    expect(await provider.recover(projectId, { id, digest: '1'.repeat(64) }, signal)).toBeUndefined()
    expect(paths).toEqual(['/v7/deployments', '/v13/deployments/dpl_test', '/v7/deployments'])
  })

  it('reports production only after domain assignment completes', async () => {
    let jobStatus = 'pending'
    const provider = vercelHosting(config, async () => Response.json({ ...project, targets: { production: { id: buildId, aliasAssigned: true, alias: ['studio.example'] } }, lastAliasRequest: { toDeploymentId: buildId, jobStatus } }))
    expect(await provider.production(projectId, signal)).toBeUndefined()
    jobStatus = 'failed'
    expect(await provider.production(projectId, signal)).toBeUndefined()
    jobStatus = 'succeeded'
    expect(await provider.production(projectId, signal)).toEqual({ buildId, url: 'https://studio.example', paused: false })
  })

  it('pauses and resumes only the authorized project without deleting deployments', async () => {
    const f = fixture()
    await f.provider.setPaused(projectId, true, signal)
    await f.provider.setPaused(projectId, false, signal)
    expect(f.requests.filter(item => item.method !== 'GET').map(item => ({ path: item.path, method: item.method }))).toEqual([
      { path: '/v1/projects/prj_test/pause', method: 'POST' },
      { path: '/v1/projects/prj_test/unpause', method: 'POST' },
    ])
    const provider = vercelHosting(config, async () => Response.json({ ...project, paused: true, targets: { production: { id: buildId, aliasAssigned: true, alias: ['studio.example'] } } }))
    expect((await provider.production(projectId, signal))?.paused).toBe(true)
  })
})
