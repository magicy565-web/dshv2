/** Bundled Site providers register independently and can be replaced by deployment plugins. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { SiteModuleId } from './site-system.ts'
import { siteTools } from './site-tools.ts'
import { manufacturingProvider } from './site-template-provider.ts'
import { companyTemplateProvider } from './site-company-template.ts'
import { staticSiteRendering } from '../../../packages/site/site/src/rendering.ts'
import { SiteLocal } from './site-local.ts'
import { vercelConfig, vercelHosting } from './site-vercel.ts'

/** Named plugin identity used by the deployment Loader. */
export const name = 'trade-site-defaults'
/** Provider registration requires the shared module registry. */
export const inject = ['siteSystems']
/** Individual built-ins can be disabled before registering a replacement under the same identity. */
export const Config = z.object({ generation: z.boolean().default(true), manufacturing: z.boolean().default(true), company: z.boolean().default(true), build: z.boolean().default(true), preview: z.boolean().default(true), publication: z.boolean().default(true), hosting: z.boolean().default(true) }).strict()
/** Register default implementations with the plugin's disposal lifetime.
 * @param ctx - Registry-owning plugin context.
 * @param config - Explicit built-in activation switches.
 */
export function apply(ctx: Context, config: z.infer<typeof Config>): void {
  const registry = ctx.siteSystems
  if (config.generation) ctx.effect(() => registry.register('generation', SiteModuleId('agent-tools@1'), 'Harness site tools', siteTools))
  if (config.manufacturing) ctx.effect(() => registry.register('template', SiteModuleId('manufacturing@1'), 'Manufacturing template', manufacturingProvider))
  if (config.company) ctx.effect(() => registry.register('template', SiteModuleId('company@3'), 'Reviewed company template', companyTemplateProvider))
  if (config.build) ctx.effect(() => registry.register('build', SiteModuleId('static@1'), 'Static source build', staticSiteRendering.build))
  if (config.preview) ctx.effect(() => registry.register('preview', SiteModuleId('static@1'), 'Sandboxed browser preview', staticSiteRendering.preview))
  if (config.publication) ctx.effect(() => registry.register('publication', SiteModuleId('local@1'), 'Local static publication', (...args) => new SiteLocal(...args)))
  if (config.hosting) ctx.effect(() => registry.register('hosting', SiteModuleId('vercel@1'), 'Vercel hosting', input => vercelHosting(vercelConfig.parse(input))))
}
