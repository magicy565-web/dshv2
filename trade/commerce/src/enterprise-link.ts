/** Enterprise catalog synchronization and expiring single-use browser handoff. */
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { base, BusinessError } from './database.ts'
import { id, fact } from './schema.ts'
import type { Fact, Principal } from './schema.ts'
import type { CommerceService } from './service.ts'
import { enterpriseTransfer } from './enterprise-wire.ts'

/** Server-owned binding to one existing local enterprise, never selected by a browser. */
export const enterpriseLinkConfig = z.object({
  token: z.string().min(32), factoryId: id, merchantId: id.optional(),
  returnUrl: z.url().refine(v => { const u = new URL(v); return !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && (u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))) }),
  ticketTtlMs: z.number().int().positive().max(300000), sessionTtlMs: z.number().int().positive().max(86400000),
}).strict()
const receiptSchema = z.object({ targetId: id, kind: z.enum(['company', 'passport']), digest: z.string(), facts: z.record(z.string(), fact), sourceRevision: z.number().int().nonnegative(), confirmedAt: z.iso.datetime().nullable(), removed: z.boolean() }).strict()
const hash = (v: string) => createHash('sha256').update(v).digest('hex')

/** Import into the bound factory; source refresh never silently overwrites locally edited values. */
export class EnterpriseLink {
  readonly config: z.infer<typeof enterpriseLinkConfig>
  constructor(readonly service: CommerceService, config: z.infer<typeof enterpriseLinkConfig>) { this.config = enterpriseLinkConfig.parse(config) }
  /** Resolve a configured human identity after server-link authentication.
   * @param role - Explicit role granted to the existing enterprise operator.
   * @returns Bound principal; an unprovisioned merchant is refused.
   */
  actor(role: 'factory' | 'merchant'): Principal {
    if (role === 'merchant' && !this.config.merchantId) throw new BusinessError('forbidden', 403)
    return { role, subjectId: role === 'factory' ? this.config.factoryId : this.config.merchantId! }
  }
  private binding(): string { return hash(JSON.stringify([this.config.factoryId, this.config.returnUrl, this.config.token, this.config.merchantId ?? null])) }
  /** Exchange a one-use code for an expiring scoped token.
   * @param code - Opaque handoff code received from the original enterprise UI.
   * @returns Browser-only token; repeated or expired exchanges fail.
   */
  exchange(code: string) {
    return this.service.store.transaction(() => {
      const deleted = this.service.store.db.prepare("DELETE FROM linked_sessions WHERE hash=? AND kind='ticket' AND binding=? AND expires_at>? RETURNING role").get(hash(code), this.binding(), this.service.clock())
      if (!deleted) throw new BusinessError('handoff_expired', 401)
      return { token: this.issue('session', this.config.sessionTtlMs, z.enum(['factory', 'merchant']).parse(deleted.role)) }
    })
  }
  /** Resolve only a live token issued by this link.
   * @param token - Browser bearer token.
   * @returns Bound human principal or null.
   */
  authenticate(token: string): Principal | null {
    const row = this.service.store.db.prepare("SELECT role FROM linked_sessions WHERE hash=? AND kind='session' AND binding=? AND expires_at>?").get(hash(token), this.binding(), this.service.clock())
    return row ? this.actor(z.enum(['factory', 'merchant']).parse(row.role)) : null
  }
  private issue(kind: 'ticket' | 'session', ttl: number, role: 'factory' | 'merchant' = 'factory') {
    this.actor(role)
    const token = randomBytes(32).toString('base64url'), db = this.service.store.db, now = this.service.clock()
    db.prepare('DELETE FROM linked_sessions WHERE expires_at<=?').run(now)
    db.prepare('INSERT INTO linked_sessions(hash,kind,binding,expires_at,role) VALUES(?,?,?,?,?)').run(hash(token), kind, this.binding(), new Date(Date.parse(now) + ttl).toISOString(), role)
    return token
  }
  /** Open saved commerce records without refreshing conflicting or temporarily locked source data.
   * @param role - Explicit human role provisioned for this enterprise.
   * @returns A one-use handoff; no business records change.
   */
  resume(role: 'factory' | 'merchant' = 'factory') { return this.service.store.transaction(() => ({ code: this.issue('ticket', this.config.ticketTtlMs, role), records: 0 })) }
  /** Revoke an owned browser session without affecting deployment credentials.
   * @param token - Current bearer token.
   */
  logout(token: string) { this.service.store.db.prepare("DELETE FROM linked_sessions WHERE hash=? AND kind='session'").run(hash(token)) }
  /** Return source identities for the connected factory, excluding credentials.
   * @param actor - Authenticated caller.
   * @returns Link and source revisions, or null for unrelated users.
   */
  status(actor: Principal) {
    if (actor.role.startsWith('merchant') && actor.subjectId === this.config.merchantId) return { returnUrl: this.config.returnUrl, sources: [] }
    if (!actor.role.startsWith('factory') || actor.subjectId !== this.config.factoryId) return null
    return { returnUrl: this.config.returnUrl, sources: this.service.store.db.prepare('SELECT source,data FROM enterprise_imports WHERE owner=?').all(actor.subjectId).map(row => {
      const r = receiptSchema.parse(JSON.parse(String(row.data)))
      return { sourceId: String(row.source), targetId: r.targetId, kind: r.kind, sourceRevision: r.sourceRevision, confirmedAt: r.confirmedAt, removed: r.removed }
    }) }
  }
  /** Atomically synchronize an authoritative source snapshot and issue a browser handoff.
   * @param input - Complete current enterprise catalog from the authenticated server.
   * @returns Single-use code and imported-record count. Source conflicts reject the transaction.
   */
  open(input: unknown) {
    const transfer = enterpriseTransfer.parse(input), s = this.service.store, owner = this.config.factoryId, now = this.service.clock()
    return s.transaction(() => {
      const pending = s.list('approval').some(a => ['EXECUTING', 'UNCERTAIN'].includes(a.status) && s.require('product', s.require('launch', a.launchId).productId).companyId === owner)
      if (pending) throw new BusinessError('publication_requires_reconciliation')
      const live = new Set<string>()
      const records = [ ...(transfer.company ? [{ kind: 'company' as const, record: transfer.company }] : []), ...transfer.products.map(record => ({ kind: 'passport' as const, record })) ]
      for (const { kind, record } of records) {
        const source = `${kind}:${record.sourceId}`; live.add(source)
        const row = s.db.prepare('SELECT data FROM enterprise_imports WHERE owner=? AND source=?').get(owner, source)
        const previous = row ? receiptSchema.parse(JSON.parse(String(row.data))) : null
        const digest = hash(JSON.stringify(record))
        if (previous?.digest === digest && !previous.removed) continue
        const targetId = previous?.targetId ?? (kind === 'company' ? owner : base(now).id)
        const current = s.get(kind, targetId)
        if (!previous && current) throw new BusinessError('enterprise_import_conflict')
        const facts: Record<string, Fact> = { ...current?.facts }
        for (const [field, previousFact] of Object.entries(previous?.facts ?? {})) {
          const currentFact = facts[field]
          if (currentFact && JSON.stringify(currentFact.value) !== JSON.stringify(previousFact.value)) throw new BusinessError('enterprise_import_conflict')
          for (const evidenceId of previousFact.evidenceIds) {
            const e = s.require('evidence', evidenceId)
            s.put('evidence', { ...e, revision: e.revision + 1, updatedAt: now, revoked: true })
          }
          // A removed source field cannot retain a standalone human confirmation from its imported value.
          facts[field] = { value: null, status: 'UNKNOWN', visibility: 'CONFIDENTIAL', evidenceIds: [] }
        }
        const imported: Record<string, Fact> = {}
        for (const [field, value] of Object.entries(record.facts)) {
          if (!previous?.facts[field] && facts[field] && JSON.stringify(facts[field].value) !== JSON.stringify(value.value)) throw new BusinessError('enterprise_import_conflict')
          const expired = value.validUntil !== null && value.validUntil <= now
          const resolved = expired ? null : value.value
          const status: Fact['status'] = resolved === null ? 'UNKNOWN' : value.conflicting ? 'CONFLICTING' : 'AI_INFERRED'
          const e = s.put('evidence', { ...base(now), ownerId: owner, entityType: kind, entityId: targetId, field, value: resolved,
            sourceType: 'DOCUMENT', sourceUrl: this.config.returnUrl, sourceFile: record.sourceId, sourceUser: null, sourceAgent: null,
            excerpt: JSON.stringify({ sourceId: record.sourceId, revision: record.revision, confirmedAt: record.confirmedAt, status: value.sourceStatus, citation: value.citation }),
            verificationStatus: status, confidence: null, capturedAt: now, validUntil: value.validUntil, revoked: expired,
          })
          facts[field] = imported[field] = { value: resolved, status, visibility: 'CONFIDENTIAL', evidenceIds: [e.id] }
        }
        const metadata = current ? { ...current, revision: current.revision + 1, updatedAt: now } : base(now, targetId)
        if (kind === 'company') s.put('company', { ...metadata, facts })
        else {
          if (!current) s.put('product', { ...base(now, targetId), companyId: owner, paused: false })
          s.put('passport', { ...metadata, productId: targetId, companyId: owner, facts })
        }
        const receipt = receiptSchema.parse({ targetId, kind, digest, facts: imported, sourceRevision: record.revision, confirmedAt: record.confirmedAt, removed: false })
        s.db.prepare('INSERT INTO enterprise_imports(owner,source,data) VALUES(?,?,?) ON CONFLICT(owner,source) DO UPDATE SET data=excluded.data').run(owner, source, JSON.stringify(receipt))
      }
      for (const row of s.db.prepare('SELECT source,data FROM enterprise_imports WHERE owner=?').all(owner)) {
        if (live.has(String(row.source))) continue
        const r = receiptSchema.parse(JSON.parse(String(row.data)))
        if (r.removed) continue
        for (const f of Object.values(r.facts)) for (const key of f.evidenceIds) {
          const e = s.require('evidence', key); s.put('evidence', { ...e, revision: e.revision + 1, updatedAt: now, revoked: true })
        }
        s.db.prepare('UPDATE enterprise_imports SET data=? WHERE owner=? AND source=?').run(JSON.stringify({ ...r, removed: true }), owner, String(row.source))
      }
      s.put('activity', { ...base(now), ownerId: owner, actor: 'Enterprise workspace', action: 'enterprise.sync', targetId: owner, detail: `${records.length} source records; commercial confirmation remains separate.` })
      return { code: this.issue('ticket', this.config.ticketTtlMs), records: records.length }
    })
  }
}
