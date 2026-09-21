/** Transfer committed site changes to ordinary append-only Sessions before serving activity. */
import { Session, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import type { SiteSpec } from '../../../packages/site/site/src/index.ts'
import type { SiteStateChange } from '../../../packages/site/site/src/types.ts'
import { siteProjection, siteStateChangeSchema } from '../../../packages/site/site/src/session.ts'

/** A durable outbox keeps Session storage failure separate from a committed source edit. */
export class SiteJournal {
  private draining: Promise<void> | undefined
  constructor(private readonly sites: InMemorySiteService, private readonly persistence: SessionPersistence) {}
  /** Deliver a committed prefix once; replay recognizes already flushed changes after a crash.
   * @returns Completion of the current drain. Failure leaves unacknowledged changes for retry.
   */
  flush(): Promise<void> {
    if (this.draining) return this.draining
    const task = this.drain()
    this.draining = task
    void task.finally(() => { if (this.draining === task) this.draining = undefined }).catch(() => { /* The caller owns the original rejection. */ })
    return task
  }
  private async drain(): Promise<void> {
    for (const change of this.sites.pendingChanges()) {
      const id = SessionId(`site-${change.siteId}`)
      const saved = await this.persistence.stat(id)
      const fresh = saved ? undefined : Session.create(id)
      const handle = saved ? await this.persistence.open(id, 'write') : await this.persistence.create(fresh!.header)
      try {
        const { events } = await handle.read()
        let previous: SiteStateChange | null = null
        for (const event of events) previous = siteProjection.apply(previous, event)
        if (previous && (previous.tenantId !== change.tenantId || previous.siteId !== change.siteId)) throw new Error('Site journal ownership mismatch')
        if (!previous || previous.sequence < change.sequence) await handle.append([{ type: 'site/state', seq: SessionSeq(events.length), time: Date.now(), data: siteStateChangeSchema.parse(change) }])
        await handle.flush()
        this.sites.acknowledgeChanges(change.sequence)
      } finally { await handle.close() }
    }
  }
  /** Read activity from durable Session events, including a replayed whole-value projection.
   * @param spec - Site authorized by the editor.
   * @returns Session identity, projected state and chronological activity records.
   */
  async read(spec: SiteSpec) {
    this.sites.resolve(spec)
    await this.flush()
    const sessionId = SessionId(`site-${spec.siteId}`)
    if (!await this.persistence.stat(sessionId)) return { sessionId, state: null, events: [] }
    const handle = await this.persistence.open(sessionId, 'read')
    try {
      const { events } = await handle.read()
      let state: SiteStateChange | null = null
      const activity: SiteStateChange[] = []
      for (const event of events) {
        state = siteProjection.apply(state, event)
        if (event.type === 'site/state') {
          if (event.data.tenantId !== spec.tenantId || event.data.siteId !== spec.siteId) throw new Error('Site journal ownership mismatch')
          activity.push(event.data)
        }
      }
      return { sessionId, state, events: activity }
    } finally { await handle.close() }
  }
}
