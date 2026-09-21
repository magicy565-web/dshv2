/** Source tests install the same registry and providers used by the trade profile. */
import type { Context } from '@deepseek-ai/cordis'
import { SiteSystemService } from '../src/site-system.ts'
import { apply, Config } from '../src/site-system-defaults.ts'

/** Mount the default provider set within an isolated test context.
 * @param ctx - Context whose disposal releases the registrations.
 * @returns Registry for selected provider overrides.
 */
export function installSiteSystem(ctx: Context): SiteSystemService {
  const registry = new SiteSystemService(ctx)
  apply(ctx, Config.parse({}))
  return registry
}
