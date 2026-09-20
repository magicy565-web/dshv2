/** Model-facing site edits use authenticated ownership and explicit observed draft versions. */
import { z } from 'zod'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { SiteService } from '../../../packages/site/site/src/index.ts'
import { SiteId, SiteRevisionId } from '../../../packages/site/site/src/types.ts'
import type { SiteProjectFile } from '../../../packages/site/site/src/types.ts'
import { parseSiteChangeSet } from '../../../packages/site/site/src/snapshot.ts'
import type { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { renderStaticPreview } from '../../../packages/site/site/src/preview.ts'
import type { SiteHosting } from './site-hosting.ts'

const identity = { siteId: z.string().uuid() }
const revision = { ...identity, revisionId: z.string().uuid() }
const file = z.object({ path: z.string().min(1), content: z.string(), encoding: z.enum(['utf8', 'base64']) }).strict()

/** Define site tools without accepting tenant identity, credentials, or raw deployment API requests.
 * @param sites - Durable site service owned by the deployment.
 * @param tenantId - Identity captured from the trusted host.
 * @param maxBytes - Maximum complete model input bytes for one operation.
 * @param hosting - Optional independent deployment history, without cloud credentials.
 * @returns Tool definitions; the host owns registration and disposal.
 */
export function siteTools(sites: SiteService, tenantId: TenantId, maxBytes: number, hosting?: SiteHosting): readonly ToolDefinition[] {
  const spec = (id: string) => sites.resolve({ tenantId, siteId: SiteId(id) })
  const observed = (id: string, expected: string | null) => {
    const resolved = spec(id)
    if ((sites.get(resolved)?.currentRevisionId ?? null) !== expected) throw new Error('site revision conflict; read the current site before editing')
    return resolved
  }
  const define = <T>(name: string, description: string, schema: z.ZodType<T>, execute: (input: T, signal: AbortSignal) => unknown | Promise<unknown>): ToolDefinition => ({
    name, description, parameters: z.toJSONSchema(schema),
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, execution) {
      if (execution.signal.aborted) throw new Error('Site operation cancelled')
      if (Buffer.byteLength(JSON.stringify(args), 'utf8') > maxBytes) throw new Error('Site operation exceeds the configured byte limit')
      return execute(schema.parse(args), execution.signal)
    },
  })
  return [
    define('site_create', 'Create a website project in this workspace. Shopify is optional. Save source files with site_update_draft, then inspect a preview before requesting publication.',
      z.object({ name: z.string().trim().min(1).max(160) }).strict(), input => sites.createSite(tenantId, input.name)),
    define('site_get', 'List workspace websites, or read one website, revision history, and publication jobs. Supply revisionId to read its source files. Use only approved public company facts in website content.',
      z.object({ siteId: z.string().uuid().optional(), revisionId: z.string().uuid().optional() }).strict().refine(input => !input.revisionId || Boolean(input.siteId)), input => {
        if (!input.siteId) return { items: sites.list(tenantId) }
        const resolved = spec(input.siteId)
        return { site: sites.get(resolved), revisions: sites.listRevisions(resolved).map(({ id, createdAt, source }) => ({ id, createdAt, source })), jobs: sites.listPublishJobs(resolved), ...(hosting ? { hosting: hosting.get(resolved) } : {}), ...(input.revisionId ? { content: sites.content(resolved, SiteRevisionId(input.revisionId)) } : {}) }
      }),
    define('site_update_draft', 'Save source and asset file changes as a new website revision. expectedRevisionId is the draft you read, or null for the first draft. Files replace matching paths; remove deletes named paths. Unchanged files are retained. static projects need index.html and browser assets; nextjs projects require an isolated build provider. Never include credentials or unapproved private business facts.',
      z.object({ ...identity, expectedRevisionId: z.string().uuid().nullable(), framework: z.enum(['static', 'nextjs']), files: z.array(file), remove: z.array(z.string()).default([]) }).strict(), async input => {
        const resolved = observed(input.siteId, input.expectedRevisionId)
        const prior = input.expectedRevisionId ? sites.content(resolved, SiteRevisionId(input.expectedRevisionId)).project : undefined
        const files = new Map<string, SiteProjectFile>((prior?.files ?? []).map(item => [item.path, item]))
        const changed = new Set<string>()
        for (const item of input.files) {
          if (changed.has(item.path) || input.remove.includes(item.path)) throw new Error('A file path cannot appear twice in one edit')
          changed.add(item.path)
        }
        for (const path of input.remove) files.delete(path)
        for (const item of input.files) files.set(item.path, item)
        const changes = parseSiteChangeSet({ ...(input.expectedRevisionId ? { baseRevisionId: input.expectedRevisionId } : {}), project: { framework: input.framework, files: [...files.values()] } })
        if (Buffer.byteLength(JSON.stringify(changes), 'utf8') > maxBytes) throw new Error('Complete site project exceeds the configured byte limit')
        const saved = await sites.createRevision(resolved, changes, 'agent')
        return { siteId: input.siteId, revisionId: saved.id, fileCount: files.size }
      }),
    define('site_preview', 'Preview an exact saved website revision without publishing it. Static projects compile locally and return a private preview URL and file manifest. Next.js projects submit once to the configured isolated cloud builder; repeated calls inspect that same build. Report its returned status accurately: only ready includes a protected preview URL, which requires the hosting team account. Use error and buildLog to diagnose failed builds before saving a corrected revision; unknown submissions need provider reconciliation.',
      z.object(revision).strict(), async (input, signal) => {
        const resolved = spec(input.siteId)
        const revisionId = SiteRevisionId(input.revisionId)
        if (sites.content(resolved, revisionId).project?.framework === 'nextjs') {
          if (!hosting?.get(resolved).configured) throw new Error('Next.js preview requires configured independent hosting. Configure the hosting provider before requesting this preview.')
          const prior = hosting.get(resolved).deployments.find(item => item.revisionId === revisionId)
          const state = prior ? await hosting.refreshDeployment(resolved, prior.id, signal) : await hosting.stage(resolved, revisionId, signal)
          const deployment = state.deployments.find(item => item.revisionId === revisionId)
          if (!deployment) throw new Error('The selected revision has no cloud build record')
          return {
            siteId: input.siteId, revisionId, kind: 'cloud', deploymentId: deployment.id, digest: deployment.digest,
            status: deployment.status, ...(deployment.buildId ? { buildId: deployment.buildId } : {}),
            ...(deployment.status === 'ready' ? { previewUrl: deployment.previewUrl } : {}),
            ...(deployment.error ? { error: deployment.error } : {}),
            ...(deployment.buildLog === undefined ? {} : { buildLog: deployment.buildLog }),
          }
        }
        const build = sites.build(resolved, revisionId)
        const previewUrl = `/api/enterprise/sites?${new URLSearchParams({ siteId: input.siteId, action: 'preview', revisionId: input.revisionId })}`
        await renderStaticPreview(build, '/', path => `${previewUrl}&path=${encodeURIComponent(path)}`, maxBytes)
        signal.throwIfAborted()
        return { revisionId: build.revisionId, digest: build.digest, previewUrl, files: build.files.map(item => ({ path: item.path, contentType: item.contentType, sha256: item.sha256 })) }
      }),
    define('site_rollback', 'Restore a saved website version as a new draft. This preserves history and does not change the live website or commerce transactions. Read the current draft before supplying expectedRevisionId.',
      z.object({ ...revision, expectedRevisionId: z.string().uuid().nullable() }).strict(), input => sites.rollback(observed(input.siteId, input.expectedRevisionId), SiteRevisionId(input.revisionId))),
  ]
}
