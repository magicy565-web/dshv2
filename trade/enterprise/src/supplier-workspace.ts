/** Revision-bound source attestations, disclosure grants and procurement requests in local SQLite. */
import { z } from 'zod'
type SupplierDatabase = { exec(sql: string): unknown; prepare(sql: string): { get(...values: Array<string | number | null>): Record<string, unknown> | undefined; all(...values: Array<string | number | null>): Record<string, unknown>[]; run(...values: Array<string | number | null>): unknown } }

/** Exact confirmed revision selected for disclosure or source checking. */
export const supplierRevision = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict()
/** Explicit document and record disclosure replaces the current grant set atomically. */
export const supplierAccess = z.object({
  expectedRevision: z.number().int().nonnegative(), records: z.array(supplierRevision).max(100),
  documents: z.array(z.string().uuid()).max(1000),
}).strict()
/** Buyer intent records no payment or outbound communication authorization. */
export const procurementRequest = z.object({
  id: z.string().uuid().brand<'ProcurementRequestId'>(),
  recordId: z.string().uuid(), recordRevision: z.number().int().positive(), nodeIds: z.array(z.string().min(1)).max(100),
  type: z.enum(['quote', 'sample', 'specification', 'partnership', 'purchase_consultation']),
  name: z.string().trim().min(1).max(160), email: z.email(),
  message: z.string().trim().min(1).max(5000),
}).strict()
/** Persisted request fields returned to the enterprise inbox. */
export const procurementRecord = procurementRequest.extend({
  revision: z.number().int().positive(), status: z.enum(['draft', 'submitted', 'in_review', 'closed']),
  source: z.enum(['workspace', 'agent', 'external']), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
})
/** Procurement inbox entry. */
export type ProcurementRecord = z.infer<typeof procurementRecord>
/** Errors are exposed as localized workspace codes or API failures. */
export class SupplierError extends Error {
  constructor(readonly status: number, readonly code: 'supplierConflict' | 'supplierMissing' | 'supplierIncomplete') { super(code) }
}

/**
 * Own durable disclosure and procurement state after schema migration.
 * @param db - Enterprise database owned by the Host lifecycle.
 * @param initial - Deployment grants used before a user saves workspace grants.
 * @returns Validated reads and optimistic mutations with audit receipts.
 */
export function supplierWorkspace(db: SupplierDatabase, initial: { records: z.infer<typeof supplierRevision>[]; documents: string[] }) {
  const get = (key: string): unknown => {
    const row = db.prepare('SELECT data FROM enterprise_supplier_state WHERE id=?').get(key)
    return row ? JSON.parse(String(row.data)) as unknown : null
  }
  const write = (key: string, data: unknown): void => { db.prepare('INSERT INTO enterprise_supplier_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(key, JSON.stringify(data)) }
  const transact = <T>(action: () => T): T => {
    db.exec('BEGIN IMMEDIATE')
    try { const value = action(); db.exec('COMMIT'); return value }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
  const audit = (action: string, target: string, revision: number, actor: string): void => {
    db.prepare('INSERT INTO enterprise_audit(actor,action,target,revision,created_at,detail) VALUES(?,?,?,?,?,?)').run(actor, action, target, revision, new Date().toISOString(), '')
  }
  const accessSchema = supplierAccess.omit({ expectedRevision: true }).extend({ revision: z.number().int().nonnegative() })
  const access = () => accessSchema.parse(get('access') ?? { ...initial, revision: 0 })
  const receiptSchema = supplierRevision.extend({ checkedAt: z.iso.datetime(), actor: z.literal('human') })
  const receipt = (id: string) => { const value = get(`receipt:${id}`); return value === null ? null : receiptSchema.parse(value) }
  const list = (): ProcurementRecord[] => db.prepare("SELECT data FROM enterprise_supplier_state WHERE id LIKE 'request:%' ORDER BY rowid DESC").all().map(row => procurementRecord.parse(JSON.parse(String(row.data))))
  return {
    access, receipt, list,
    setAccess: (input: z.infer<typeof supplierAccess>) => transact(() => {
      const current = access()
      if (input.expectedRevision !== current.revision) throw new SupplierError(409, 'supplierConflict')
      const value = { records: input.records, documents: [...new Set(input.documents)], revision: current.revision + 1 }
      write('access', value); audit('supplier_access', 'supplier', value.revision, 'human')
      return value
    }),
    attest: (input: z.infer<typeof supplierRevision>) => transact(() => {
      const value = { ...input, checkedAt: new Date().toISOString(), actor: 'human' as const }
      write(`receipt:${input.id}`, value); audit('supplier_source_check', input.id, input.revision, 'human')
      return value
    }),
    create: (input: z.infer<typeof procurementRequest>, source: ProcurementRecord['source']) => transact(() => {
      const previous = get(`request:${input.id}`)
      if (previous) {
        const current = procurementRecord.parse(previous)
        if (current.source !== source || JSON.stringify(procurementRequest.strip().parse(current)) !== JSON.stringify(input)) throw new SupplierError(409, 'supplierConflict')
        return current
      }
      const now = new Date().toISOString()
      const value = procurementRecord.parse({ ...input, source, revision: 1, status: source === 'external' ? 'submitted' : 'draft', createdAt: now, updatedAt: now })
      write(`request:${input.id}`, value); audit('procurement_create', input.id, 1, source)
      return value
    }),
    transition: (id: ProcurementRecord['id'], expectedRevision: number, status: ProcurementRecord['status']) => transact(() => {
      const raw = get(`request:${id}`)
      if (!raw) throw new SupplierError(404, 'supplierMissing')
      const current = procurementRecord.parse(raw)
      if (current.revision !== expectedRevision) throw new SupplierError(409, 'supplierConflict')
      const allowed: Record<ProcurementRecord['status'], ProcurementRecord['status'][]> = { draft: ['submitted', 'closed'], submitted: ['in_review', 'closed'], in_review: ['closed'], closed: [] }
      if (!allowed[current.status].includes(status)) throw new SupplierError(409, 'supplierConflict')
      const value = { ...current, revision: current.revision + 1, status, updatedAt: new Date().toISOString() }
      write(`request:${id}`, value); audit(`procurement_${status}`, id, value.revision, 'human')
      return value
    }),
  }
}
