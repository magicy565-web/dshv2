/** Starter creation saves editable source through the same revision service as subsequent edits. */
import type { SiteService } from '../../../packages/site/site/src/index.ts'
import type { Site, SiteRevision } from '../../../packages/site/site/src/types.ts'
import type { TenantId } from '../../../packages/shopify/shopify/src/types.ts'
import { parseSiteChangeSet } from '../../../packages/site/site/src/snapshot.ts'
import type { SiteTemplateService } from '../../../packages/site/site/src/templates.ts'
import type { SiteTemplateRequest } from '../../../packages/site/site/src/template-types.ts'
import { SiteHostingError } from './site-hosting.ts'

/** Create a template draft after validating its complete editable project against the deployment limit.
 * @param sites - Authenticated workspace site service.
 * @param tenantId - Tenant captured by the host.
 * @param name - Validated display name.
 * @param maxBytes - Maximum complete source revision request bytes.
 * @param source - Actor creating the initial revision.
 * @param templates - Installed template providers.
 * @param request - Exact provider version and input parameters.
 * @returns Created site with its saved current revision; no publication is requested.
 */
export function createTemplateSite(sites: SiteService, tenantId: TenantId, name: string, maxBytes: number, source: SiteRevision['source'], templates: SiteTemplateService, request: SiteTemplateRequest): Site {
  const changeSet = parseSiteChangeSet({ project: templates.generate(request) })
  if (Buffer.byteLength(JSON.stringify({ changeSet }), 'utf8') > maxBytes) throw new SiteHostingError(413, 'Template project exceeds the configured byte limit')
  return sites.createSiteWithProject(tenantId, name, changeSet.project!, source)
}
