/** Versioned template registry and source-edit protection shared by editor and agent consumers. */
import { Context, Service } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import type { SiteProject } from './types.ts'
import { validateSiteProject } from './project.ts'
import type { SiteTemplateDescriptor, SiteTemplateProvider, SiteTemplateReceipt, SiteTemplateRequest } from './template-types.ts'

/** Portable receipt included in source export and historical revisions. */
export const SITE_TEMPLATE_RECEIPT = 'site.template.json'

/** Expected template selection or source-edit refusal for editor and tool consumers. */
export class SiteTemplateError extends Error {
  constructor(readonly code: 'unavailable' | 'invalid-receipt' | 'source-edited', message: string) { super(message) }
}

function digest(project: SiteProject): string {
  const files = project.files.filter(file => file.path !== SITE_TEMPLATE_RECEIPT)
    .toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return createHash('sha256').update(JSON.stringify({ framework: project.framework, files })).digest('hex')
}

function readReceipt(project: SiteProject): SiteTemplateReceipt {
  const file = project.files.find(item => item.path === SITE_TEMPLATE_RECEIPT)
  if (!file || file.encoding !== 'utf8') throw new SiteTemplateError('invalid-receipt', 'This project has no template receipt; keep editing its source')
  let value: unknown
  try { value = JSON.parse(file.content) }
  catch { throw new SiteTemplateError('invalid-receipt', 'Invalid site template receipt JSON') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SiteTemplateError('invalid-receipt', 'Invalid site template receipt')
  const record = value as Record<string, unknown>
  if (record.format !== 1 || typeof record.id !== 'string' || !record.id || typeof record.version !== 'string' || !record.version
    || !record.parameters || typeof record.parameters !== 'object' || Array.isArray(record.parameters)
    || typeof record.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.sourceDigest)) {
    throw new SiteTemplateError('invalid-receipt', 'Invalid site template receipt')
  }
  // JSON parsing establishes serializable values; the provider validates its parameter schema during regeneration.
  return record as unknown as SiteTemplateReceipt
}

declare module '@deepseek-ai/cordis' {
  interface Context { siteTemplates: SiteTemplateService }
}

/** Installed template versions; saved projects remain readable when a provider is unloaded. */
export class SiteTemplateService extends Service {
  private readonly providers = new Map<string, SiteTemplateProvider>()
  constructor(ctx: Context) { super(ctx, 'siteTemplates') }

  /** Register one provider under the caller's effect lifetime.
   * @param provider - Trusted provider with an immutable version identifier.
   * @returns Idempotent disposer; duplicate versions are rejected.
   */
  register(provider: SiteTemplateProvider): () => void {
    const descriptor = structuredClone(provider.descriptor)
    const key = JSON.stringify([descriptor.id, descriptor.version])
    if (this.providers.has(key)) throw new Error('Site template version is already registered')
    const registered = { descriptor, resolve: provider.resolve.bind(provider), render: provider.render.bind(provider) }
    this.providers.set(key, registered)
    return () => { if (this.providers.get(key) === registered) this.providers.delete(key) }
  }

  /** List installed versions without exposing executable provider methods.
   * @returns Detached descriptors including input schemas.
   */
  list(): readonly SiteTemplateDescriptor[] { return structuredClone([...this.providers.values()].map(provider => provider.descriptor)) }

  /** Resolve parameters and generate source with a pinned receipt.
   * @param request - Exact version and untrusted parameters.
   * @returns Validated source project with its template receipt.
   */
  generate(request: SiteTemplateRequest): SiteProject {
    const provider = this.providers.get(JSON.stringify([request.id, request.version]))
    if (!provider) throw new SiteTemplateError('unavailable', 'Requested site template version is not installed')
    const parameters = structuredClone(provider.resolve(request.parameters))
    const project = provider.render(structuredClone(parameters))
    const errors = validateSiteProject(project)
    if (errors.length) throw new Error(errors.join('; '))
    if (project.files.some(file => file.path === SITE_TEMPLATE_RECEIPT)) throw new Error('Template provider cannot supply site.template.json')
    const receipt: SiteTemplateReceipt = { format: 1, id: request.id, version: request.version, parameters, sourceDigest: digest(project) }
    return structuredClone({ ...project, files: [...project.files, { path: SITE_TEMPLATE_RECEIPT, encoding: 'utf8' as const, content: JSON.stringify(receipt, null, 2) + '\n' }] })
  }

  /** Inspect saved parameters and whether source has diverged from its generated revision.
   * @param project - Saved or editor-owned project.
   * @returns Receipt and source-edit status, without needing the provider installed.
   */
  inspect(project: SiteProject): { readonly receipt: SiteTemplateReceipt; readonly sourceEdited: boolean } {
    const receipt = readReceipt(project)
    return { receipt, sourceEdited: digest(project) !== receipt.sourceDigest }
  }

  /** Regenerate an unchanged template project using its exact provider version.
   * @param project - Observed source; manual edits prohibit regeneration.
   * @param parameters - Complete replacement parameters validated by the provider.
   * @returns New source; callers persist it as a new version after checking the observed revision.
   */
  regenerate(project: SiteProject, parameters: unknown): SiteProject {
    const state = this.inspect(project)
    if (state.sourceEdited) {
      throw new SiteTemplateError('source-edited', 'Source has manual edits; keep editing source or create a separate template site')
    }
    return this.generate({ id: state.receipt.id, version: state.receipt.version, parameters })
  }
}

export default SiteTemplateService
