/** Exercise a real Site mutation as a log-only SDK event, independent of model history. */
import { InMemorySiteService } from '../../../packages/site/site/lib/types/memory.js'
export const name = 'snapshot-site-producer'
export const inject = ['sessions']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - Runtime owner of the site service.
 */
export function apply(ctx) {
  const sites = new InMemorySiteService(ctx)
  const spec = { tenantId: 'snapshot-owner', siteId: '00000000-0000-4000-8000-000000000001' }
  sites.restore({ sites: [{ id: spec.siteId, tenantId: spec.tenantId, name: 'Draft' }], revisions: [], jobs: [] })
  ctx.on('agent/turn-stopping', ({ agent }) => {
    if (agent.session.header.parentSession !== undefined) return
    const messages = JSON.stringify(agent.session.deriveMessages())
    sites.manage(spec, 0, { name: 'Reviewed website' })
    for (const change of sites.pendingChanges()) {
      agent.session.append('site/state', { ...change, time: 0 })
      sites.acknowledgeChanges(change.sequence)
    }
    if (JSON.stringify(agent.session.deriveMessages()) !== messages) throw new Error('Site activity changed model history')
  })
}
