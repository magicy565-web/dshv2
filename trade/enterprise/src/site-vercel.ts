/** Vercel hosting adapter: protected staged production builds and exact-build promotion. */
import { z } from 'zod'
import { buildStaticSite } from '../../../packages/site/site/src/project.ts'
import { renderStaticPreview } from '../../../packages/site/site/src/preview.ts'
import { SiteRevisionId } from '../../../packages/site/site/src/types.ts'
import type { HostingBuildId, HostingProjectId } from './site-hosting-schema.ts'
import { HostingRejected, type HostingBuild, type SiteHostingProvider } from './site-hosting-provider.ts'
import { vercelDomains } from './site-vercel-domains.ts'

/** Deployment-owned credentials and limits; none are returned to the model or browser. */
export const vercelConfig = z.object({
  token: z.string().min(1), teamId: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(), maxResponseBytes: z.number().int().positive(),
  maxDeploymentBytes: z.number().int().positive(),
  recoveryPageSize: z.number().int().min(1).max(100), maxRecoveryPages: z.number().int().positive(),
  maxDomains: z.number().int().positive(),
}).strict()

const projectSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), autoAssignCustomDomains: z.boolean().optional(),
  paused: z.boolean().default(false),
  ssoProtection: z.object({ deploymentType: z.string() }).nullable().optional(),
  lastAliasRequest: z.object({ toDeploymentId: z.string(), jobStatus: z.string() }).nullable().optional(),
  targets: z.record(z.string(), z.object({ id: z.string(), aliasAssigned: z.union([z.boolean(), z.number()]).nullable().optional(), alias: z.array(z.string()).optional() }).nullable()).optional(),
})
const buildSchema = z.object({
  id: z.string().min(1), projectId: z.string().min(1), url: z.string().min(1), target: z.literal('production'),
  readyState: z.enum(['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED', 'BLOCKED']),
})

function httpsDomain(domain: string): string {
  const url = new URL(`https://${domain}`)
  if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Invalid hosting domain')
  return url.origin
}

/** Construct a provider with an injectable HTTP transport for wire-level tests.
 * @param input - Host-owned token, team identity and deployment resource limits.
 * @param transport - Fetch implementation; the API origin stays fixed to Vercel.
 * @returns A provider whose stage operation never assigns production domains.
 */
export function vercelHosting(input: z.infer<typeof vercelConfig>, transport: typeof fetch = fetch): SiteHostingProvider {
  const config = vercelConfig.parse(input)
  const api = async (path: string, signal: AbortSignal, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<unknown> => {
    const url = new URL(path, 'https://api.vercel.com')
    url.searchParams.set('teamId', config.teamId)
    const response = await transport(url, {
      method, signal: AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)]), redirect: 'error',
      headers: { authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      const message = `Hosting API request failed (${response.status})`
      if (response.status >= 400 && response.status < 500 && response.status !== 408) throw new HostingRejected(message)
      throw new Error(message)
    }
    const reader = response.body?.getReader()
    if (!reader) return undefined
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > config.maxResponseBytes) { await reader.cancel(); throw new Error('Hosting API response exceeds the configured limit') }
        chunks.push(chunk.value)
      }
    } finally { reader.releaseLock() }
    return bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown : undefined
  }
  const readProject = async (id: HostingProjectId, signal: AbortSignal) => {
    const project = projectSchema.parse(await api(`/v9/projects/${encodeURIComponent(id)}`, signal))
    if (project.id !== id) throw new Error('Hosting project identity mismatch')
    return project
  }
  const protectedProject = async (id: HostingProjectId, signal: AbortSignal) => {
    const project = await readProject(id, signal)
    if (project.autoAssignCustomDomains !== false || project.ssoProtection?.deploymentType !== 'prod_deployment_urls_and_all_previews') throw new HostingRejected('Hosting project must protect deployment URLs and disable automatic production assignment')
    return project
  }
  const observation = (value: unknown, projectId: HostingProjectId, buildId?: HostingBuildId): HostingBuild => {
    const build = buildSchema.parse(value)
    if ((buildId && build.id !== buildId) || build.projectId !== projectId) throw new Error('Hosting build ownership mismatch')
    const previewUrl = httpsDomain(build.url)
    if (!new URL(previewUrl).hostname.endsWith('.vercel.app')) throw new Error('Unexpected hosting preview domain')
    return { id: build.id as HostingBuildId, previewUrl, status: build.readyState === 'READY' ? 'ready' : ['ERROR', 'CANCELED', 'BLOCKED'].includes(build.readyState) ? 'failed' : 'building' }
  }
  const inspect = async (projectId: HostingProjectId, buildId: HostingBuildId, signal: AbortSignal): Promise<HostingBuild> => observation(await api(`/v13/deployments/${encodeURIComponent(buildId)}`, signal), projectId, buildId)
  return {
    ...vercelDomains(api, readProject, { maxDomains: config.maxDomains, maxPages: config.maxRecoveryPages }),
    async createProject(name, signal) {
      const created = projectSchema.parse(await api('/v11/projects', signal, { name, framework: null, ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' } }))
      const id = created.id as HostingProjectId
      await api(`/v9/projects/${encodeURIComponent(id)}`, signal, { autoAssignCustomDomains: false }, 'PATCH')
      await protectedProject(id, signal)
      return id
    },
    async stage(projectId, source, signal) {
      await api(`/v9/projects/${encodeURIComponent(projectId)}`, signal, { autoAssignCustomDomains: false }, 'PATCH')
      const project = await protectedProject(projectId, signal)
      let files: { file: string; data: string; encoding: 'base64' }[]
      if (source.project.framework === 'static') {
        try {
          const artifact = buildStaticSite(SiteRevisionId(source.revisionId), source.project)
          files = []
          for (const file of artifact.files) {
            signal.throwIfAborted()
            const data = file.contentType.startsWith('text/html')
              ? Buffer.from(await (await renderStaticPreview(artifact, `/${file.path}`, path => path, config.maxDeploymentBytes)).arrayBuffer()).toString('base64')
              : file.base64
            files.push({ file: `public/${file.path}`, data, encoding: 'base64' })
          }
        } catch (error) {
          signal.throwIfAborted()
          throw new HostingRejected(error instanceof Error ? error.message : 'Static build failed')
        }
      } else {
        if (source.project.files.some(file => file.path === 'vercel.json' || file.path.startsWith('.vercel/'))) throw new HostingRejected('Provider deployment settings must be configured outside generated source')
        if (!source.project.files.some(file => file.path === 'package.json')) throw new HostingRejected('Next.js projects require package.json')
        files = source.project.files.map(file => ({ file: file.path, data: file.encoding === 'base64' ? file.content : Buffer.from(file.content).toString('base64'), encoding: 'base64' }))
      }
      const payload = {
        name: project.name, project: projectId, target: 'production', files,
        meta: { dshDeploymentId: source.id, dshSourceDigest: source.digest, dshRevisionId: source.revisionId },
        projectSettings: source.project.framework === 'static'
          ? { framework: null, buildCommand: '', installCommand: '', outputDirectory: 'public' }
          : { framework: 'nextjs', buildCommand: null, installCommand: null, outputDirectory: null },
      }
      if (Buffer.byteLength(JSON.stringify(payload)) > config.maxDeploymentBytes) throw new HostingRejected('Hosting upload exceeds the configured byte limit')
      return observation(await api('/v13/deployments?skipAutoDetectionConfirmation=1&forceNew=1', signal, payload), projectId)
    },
    inspect,
    async recover(projectId, input, signal) {
      let until: number | undefined
      for (let page = 0; page < config.maxRecoveryPages; page++) {
        const query = new URLSearchParams({ projectId, target: 'production', limit: String(config.recoveryPageSize), ...(until === undefined ? {} : { until: String(until) }) })
        const result = z.object({ deployments: z.array(z.object({ uid: z.string(), projectId: z.string(), meta: z.record(z.string(), z.string()).optional() })), pagination: z.object({ next: z.number().nullable() }) }).parse(await api(`/v7/deployments?${query}`, signal))
        const matches = result.deployments.filter(item => item.projectId === projectId && item.meta?.dshDeploymentId === input.id && item.meta.dshSourceDigest === input.digest)
        if (matches.length > 1) throw new Error('Multiple cloud builds match one workspace submission')
        const match = matches[0]
        if (match) return inspect(projectId, match.uid as HostingBuildId, signal)
        if (result.pagination.next === null) return undefined
        if (until !== undefined && result.pagination.next >= until) throw new Error('Hosting pagination did not advance')
        until = result.pagination.next
      }
      throw new Error('Hosting recovery exceeded the configured page limit')
    },
    async promote(projectId, buildId, rollback, signal) {
      await api(`/v9/projects/${encodeURIComponent(projectId)}`, signal, { autoAssignCustomDomains: false }, 'PATCH')
      const project = await protectedProject(projectId, signal)
      if (project.paused) throw new HostingRejected('Resume the website before publishing another build')
      const build = await inspect(projectId, buildId, signal)
      if (build.status !== 'ready') throw new Error('Only a ready build can be promoted')
      await api(`/v${rollback ? '1' : '10'}/projects/${encodeURIComponent(projectId)}/${rollback ? 'rollback' : 'promote'}/${encodeURIComponent(buildId)}`, signal, {})
      // Vercel promotion can re-enable automatic domain assignment on the project.
      await api(`/v9/projects/${encodeURIComponent(projectId)}`, signal, { autoAssignCustomDomains: false }, 'PATCH')
    },
    async production(projectId, signal) {
      const project = await readProject(projectId, signal)
      const current = project.targets?.production
      if (!current?.aliasAssigned || !current.alias?.length) return undefined
      if (project.lastAliasRequest?.toDeploymentId === current.id && project.lastAliasRequest.jobStatus !== 'succeeded') return undefined
      const domain = current.alias[0]
      if (!domain) return undefined
      return { buildId: current.id as HostingBuildId, url: httpsDomain(domain), paused: project.paused }
    },
    async setPaused(projectId, paused, signal) {
      await readProject(projectId, signal)
      await api(`/v1/projects/${encodeURIComponent(projectId)}/${paused ? 'pause' : 'unpause'}`, signal, {})
    },
  }
}
