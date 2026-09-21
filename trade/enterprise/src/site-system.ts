/** Deployment-selected Site modules; registrations contain trusted installation code, never project source. */
import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { SiteRendering } from '../../../packages/site/site/src/rendering.ts'
import type { SiteTemplateProvider } from '../../../packages/site/site/src/template-types.ts'
import type { SiteLocal } from './site-local.ts'
import type { siteTools } from './site-tools.ts'
import type { SiteHostingProvider } from './site-hosting-provider.ts'

/** Exact installed implementation identity, including its provider-owned version. */
export type SiteModuleId = Branded<'SiteModuleId'>
/** Parse a deployment-selected identity after configuration validation.
 * @param value - Installed module identity.
 * @returns Branded registry key.
 */
export function SiteModuleId(value: string): SiteModuleId { return brandString<SiteModuleId>(value) }
/** Publication providers implement the full public service, including intake and disposal. */
export type SitePublication = Pick<SiteLocal, keyof SiteLocal>
/** Independently replaceable implementations consumed by the Site editor. */
export interface SiteSystemModules {
  generation: typeof siteTools
  template: SiteTemplateProvider
  build: SiteRendering['build']
  preview: SiteRendering['preview']
  publication: (...args: ConstructorParameters<typeof SiteLocal>) => SitePublication
  hosting: (config: unknown) => SiteHostingProvider
}
/** Public diagnostics identify installed providers without exposing configuration or functions. */
export interface SiteModuleDescriptor { readonly kind: keyof SiteSystemModules; readonly id: SiteModuleId; readonly name: string }
const identifier = z.string().trim().min(1).max(160)
/** Selection defaults are resolved once at the deployment entry, before any Site storage is opened. */
export const siteSystemConfig = z.object({
  generation: identifier.default('agent-tools@1'),
  templates: z.array(identifier).default(['manufacturing@1', 'company@3']).refine(ids => new Set(ids).size === ids.length, 'Template modules must be unique'),
  build: identifier.default('static@1'),
  preview: identifier.default('static@1'),
  publication: identifier.default('local@1'),
  hosting: identifier.nullable().default('vercel@1'),
}).strict()

declare module '@deepseek-ai/cordis' { interface Context { siteSystems: SiteSystemService } }

/** Typed module registry shared by default providers, external plugins and the enterprise consumer. */
export class SiteSystemService extends Service {
  private readonly modules = new Map<string, { descriptor: SiteModuleDescriptor; implementation: unknown }>()
  constructor(ctx: Context) { super(ctx, 'siteSystems') }

  /** Register one implementation under the contributing plugin's effect lifetime.
   * @param kind - Capability implemented by this module.
   * @param id - Exact provider identity used in deployment configuration.
   * @param name - Human-readable diagnostic label.
   * @param implementation - Trusted implementation matching this capability's interface.
   * @returns Idempotent disposer; duplicate identities are rejected.
   */
  register<K extends keyof SiteSystemModules>(kind: K, id: SiteModuleId, name: string, implementation: SiteSystemModules[K]): () => void {
    const key = JSON.stringify([kind, id])
    if (this.modules.has(key)) throw new Error(`Site ${kind} module is already registered: ${id}`)
    const entry = { descriptor: { kind, id, name }, implementation }
    this.modules.set(key, entry)
    return () => { if (this.modules.get(key) === entry) this.modules.delete(key) }
  }

  /** List installed module metadata without credentials or executable code.
   * @returns Detached descriptors in registration order.
   */
  list(): readonly SiteModuleDescriptor[] { return [...this.modules.values()].map(entry => ({ ...entry.descriptor })) }

  /** Bind configured implementations before opening stores or mounting request handlers.
   * @param input - Deployment selection; missing or unloaded modules fail without fallback.
   * @returns Selected implementations and a guard that rejects removed or replaced registrations.
   */
  resolve(input: z.input<typeof siteSystemConfig>) {
    const selection = siteSystemConfig.parse(input)
    const captured = new Map<string, object>()
    const take = <K extends keyof SiteSystemModules>(kind: K, id: string): SiteSystemModules[K] => {
      const key = JSON.stringify([kind, id])
      const entry = this.modules.get(key)
      if (!entry) throw new Error(`Site ${kind} module is not installed: ${id}`)
      captured.set(key, entry)
      // register ties each capability key to its implementation type; the map erases that association.
      return entry.implementation as SiteSystemModules[K]
    }
    return {
      selection,
      generation: take('generation', selection.generation),
      templates: selection.templates.map(id => take('template', id)),
      rendering: { build: take('build', selection.build), preview: take('preview', selection.preview) },
      publication: take('publication', selection.publication),
      hosting: selection.hosting === null ? undefined : take('hosting', selection.hosting),
      assertAvailable: () => { for (const [key, entry] of captured) if (this.modules.get(key) !== entry) throw new Error(`Selected Site module changed; reload the enterprise plugin: ${key}`) },
    }
  }
}

export default SiteSystemService
