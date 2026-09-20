/** Vercel wire tests keep credentials out of generated projects and preserve protected staging. */
import { describe, expect, it } from 'vitest'
import { vercelHosting } from '../src/site-vercel.ts'
import { HostingRejected } from '../src/site-hosting-provider.ts'
import type { HostingBuildId, HostingProjectId, SiteDeploymentId } from '../src/site-hosting-schema.ts'

const projectId = 'prj_test' as HostingProjectId
const buildId = 'dpl_test' as HostingBuildId
const signal = new AbortController().signal
const config = { token: 'host-only-token', teamId: 'team_test', requestTimeoutMs: 10000, maxResponseBytes: 100000, maxDeploymentBytes: 100000, recoveryPageSize: 100, maxRecoveryPages: 5, maxDomains: 20, maxBuildLogEvents: 100, maxDiagnosticCharacters: 20000 }
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

  it('uploads Next.js source to the isolated builder and refuses source-owned deployment settings', async () => {
    const f = fixture()
    const source = {
      id: crypto.randomUUID() as SiteDeploymentId, revisionId: crypto.randomUUID(), digest: '0'.repeat(64),
      project: { framework: 'nextjs' as const, files: [
        { path: 'package.json', content: '{"scripts":{"build":"next build"}}', encoding: 'utf8' as const },
        { path: 'app/page.tsx', content: 'export default function Page() { return <h1>Website</h1> }', encoding: 'utf8' as const },
        { path: 'public/pixel.png', content: 'AP8=', encoding: 'base64' as const },
      ] },
    }
    expect(await f.provider.stage(projectId, source, signal)).toMatchObject({ id: buildId, status: 'ready' })
    const payload = f.requests.find(item => item.path === '/v13/deployments')!.body!
    expect(payload.projectSettings).toEqual({ framework: 'nextjs', buildCommand: null, installCommand: null, outputDirectory: null })
    expect(payload.files).toEqual(source.project.files.map(file => ({ file: file.path, encoding: 'base64', data: file.encoding === 'utf8' ? Buffer.from(file.content).toString('base64') : file.content })))
    expect(payload.meta).toEqual({ dshDeploymentId: source.id, dshSourceDigest: source.digest, dshRevisionId: source.revisionId })
    expect(JSON.stringify(payload)).not.toContain(config.token)
    for (const path of ['vercel.json', '.vercel/project.json']) {
      await expect(f.provider.stage(projectId, { ...source, project: { ...source.project, files: [...source.project.files, { path, content: '{}', encoding: 'utf8' }] } }, signal)).rejects.toThrow('outside generated source')
    }
    await expect(f.provider.stage(projectId, { ...source, project: { ...source.project, files: [] } }, signal)).rejects.toThrow('require package.json')
    expect(f.requests.filter(item => item.path === '/v13/deployments')).toHaveLength(1)
  })

  it('does not disclose provider error bodies and bounds successful response bytes', async () => {
    const denied = vercelHosting(config, async () => new Response('secret host-only-token', { status: 403 }))
    await expect(denied.inspect(projectId, buildId, signal)).rejects.toThrow('Hosting API request failed (403)')
    const large = vercelHosting({ ...config, maxResponseBytes: 1 }, async () => Response.json(build))
    await expect(large.inspect(projectId, buildId, signal)).rejects.toThrow('configured limit')
  })

  it('returns bounded owned build diagnostics without terminal escapes or control-plane credentials', async () => {
    const paths: string[] = []
    const provider = vercelHosting({ ...config, maxBuildLogEvents: 2, maxDiagnosticCharacters: 90 }, async input => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      if (!url.pathname.endsWith('/events')) return Response.json({ ...build, readyState: 'ERROR', errorCode: 'BUILD_FAILED', errorMessage: 'Compilation failed', env: { PRIVATE: 'not-for-the-model' } })
      expect(url.searchParams.get('follow')).toBe('0')
      expect(url.searchParams.get('builds')).toBe('1')
      expect(url.searchParams.get('direction')).toBe('backward')
      expect(url.searchParams.get('limit')).toBe('2')
      return Response.json([
        { payload: { deploymentId: buildId, text: '\u001b[31mError: module missing\u001b[0m ' + config.token } },
        { payload: { deploymentId: buildId, text: 'app/page.tsx:1' } },
        { payload: { deploymentId: buildId, text: 'Outside requested tail' } },
      ])
    })
    const result = await provider.inspect(projectId, buildId, signal)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('BUILD_FAILED: Compilation failed')
    expect(result.buildLog).toBe('app/page.tsx:1\nError: module missing [redacted]')
    expect((result.error?.length ?? 0) + (result.buildLog?.length ?? 0)).toBeLessThanOrEqual(90)
    expect(JSON.stringify(result)).not.toContain('not-for-the-model')
    expect(JSON.stringify(result)).not.toContain(config.token)
    expect(paths).toEqual(['/v13/deployments/dpl_test', '/v3/deployments/dpl_test/events'])
  })

  it('retains confirmed build failure when logs are unavailable, malformed or belong to a different deployment', async () => {
    for (const logs of [new Response(null, { status: 403 }), Response.json({ malformed: true }), Response.json([{ payload: { deploymentId: 'foreign', text: 'private log' } }])]) {
      const provider = vercelHosting(config, async input => new URL(String(input)).pathname.endsWith('/events') ? logs : Response.json({ ...build, readyState: 'ERROR', errorMessage: 'Syntax error' }))
      const result = await provider.inspect(projectId, buildId, signal)
      expect(result).toMatchObject({ status: 'failed', error: 'ERROR: Syntax error' })
      expect(result.buildLog).toBeUndefined()
      expect(JSON.stringify(result)).not.toContain('private log')
    }
    let calls = 0
    const foreign = vercelHosting(config, async () => { calls++; return Response.json({ ...build, projectId: 'foreign', readyState: 'ERROR' }) })
    await expect(foreign.inspect(projectId, buildId, signal)).rejects.toThrow('ownership mismatch')
    expect(calls).toBe(1)
  })

  it('keeps the tail within the diagnostic character budget and records an empty successful log', async () => {
    const provider = vercelHosting({ ...config, maxDiagnosticCharacters: 12 }, async input => new URL(String(input)).pathname.endsWith('/events') ? Response.json([{ payload: { text: '0123456789abcdefghijklmnopqrstuvwxyz' } }]) : Response.json({ ...build, readyState: 'ERROR' }))
    expect(await provider.inspect(projectId, buildId, signal)).toMatchObject({ error: 'ERROR', buildLog: 'tuvwxyz' })
    const empty = vercelHosting(config, async input => new URL(String(input)).pathname.endsWith('/events') ? Response.json([]) : Response.json({ ...build, readyState: 'CANCELED' }))
    expect(await empty.inspect(projectId, buildId, signal)).toMatchObject({ status: 'failed', error: 'CANCELED', buildLog: '' })
  })

  it('retains accepted promotion uncertainty when the following settings request is rejected', async () => {
    let accepted = false
    const provider = vercelHosting(config, async (input, init) => {
      const path = new URL(String(input)).pathname
      if (path.includes('/promote/')) { accepted = true; return new Response(null, { status: 201 }) }
      if (accepted && init?.method === 'PATCH') return new Response(null, { status: 403 })
      return Response.json(path.startsWith('/v13/deployments/') ? build : project)
    })
    const failure = await provider.promote(projectId, buildId, false, signal).catch(error => error)
    expect(accepted).toBe(true)
    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(HostingRejected)
    expect(failure.message).toBe('Promotion was accepted but project settings were not confirmed')
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
