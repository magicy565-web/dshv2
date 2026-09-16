/** Local enterprise editor adapter on the authenticated Connection carrier. */
import type { Context } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { SqliteSiteStateStore } from '../../../packages/site/site/src/sqlite.ts'
import { createSiteHttpHandler } from '../../../packages/site/site/src/http.ts'
import type { StoreConnectionId, TenantId } from '../../../packages/shopify/shopify/src/types.ts'

/** Open local editor storage and construct its authenticated carrier handler.
 * @param ctx - Enterprise plugin context, owning the site service.
 * @param directory - Enterprise storage directory.
 * @param publicOrigin - Configured origin used for preview links.
 * @param authorizeConnection - Store authorization owned by the enterprise deployment.
 * @param maxBodyBytes - Complete JSON body limit.
 * @returns Editor handler and storage disposer; drain requests before closing.
 */
export function siteEditor(ctx: Context, directory: string, publicOrigin: string, authorizeConnection: (id: StoreConnectionId) => Promise<void>, maxBodyBytes: number) {
  const storage = new SqliteSiteStateStore(join(directory, 'sites.sqlite'))
  try {
    const service = new InMemorySiteService(ctx, undefined, storage)
    const handler = createSiteHttpHandler(service, {
      authenticate: async () => 'enterprise' as TenantId,
      authorizeConnection: async (_tenant, id) => authorizeConnection(id),
      publicOrigin, maxBodyBytes,
    })
    return {
      fetch: (request: Request, route: string) => {
        const query = new URL(request.url).searchParams
        const siteId = query.get('siteId')
        const action = query.get('action')
        const normalized = route === '/sites' && siteId ? `/sites/${siteId}${action ? `/${action}` : ''}` : route
        return handler(request, normalized)
      },
      close: () => storage.close(),
    }
  } catch (error) {
    storage.close()
    throw error
  }
}
