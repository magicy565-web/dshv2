/** Approval lifecycle and append-only audit records for enterprise changes. */
import { z } from 'zod'
type EnterpriseDatabase = { prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[]; run(...args: unknown[]): unknown }; exec(sql: string): void }

/** Approval states are separate from task and asset lifecycle states. */
export const approvalStatus = z.enum(['draft', 'submitted', 'approved', 'rejected'])
export type ApprovalStatus = z.infer<typeof approvalStatus>
export const approvalCommand = z.object({
  kind: z.enum(['task']), id: z.string().uuid(), expectedRevision: z.number().int().positive(), action: z.enum(['submit', 'approve', 'reject']), comment: z.string().max(2000).default(''),
}).strict()
export type ApprovalCommand = z.infer<typeof approvalCommand>
export const approvalSchema = z.object({ kind: z.literal('task'), id: z.string().uuid(), revision: z.number().int().positive(), status: approvalStatus, comment: z.string(), updatedAt: z.iso.datetime() })
export type Approval = z.infer<typeof approvalSchema>
export const auditSchema = z.object({ id: z.number().int().positive(), actor: z.string(), action: z.string(), target: z.string(), revision: z.number().int().positive().nullable(), createdAt: z.iso.datetime(), detail: z.string() })
export type AuditEntry = z.infer<typeof auditSchema>

/** Explicit workflow failures. */
export class GovernanceError extends Error {
  constructor(readonly status: number, readonly code: 'approvalConflict' | 'approvalMissing' | 'approvalInvalid') { super(code) }
}

/** Own approval and audit writes on the Host database. */
export function governanceStore(db: EnterpriseDatabase) {
  const read = (id: string): Approval | null => {
    const row = db.prepare('SELECT data FROM enterprise_approvals WHERE id=?').get(id)
    return row ? approvalSchema.parse(JSON.parse(String((row as Record<string, unknown>).data))) : null
  }
  const audit = (action: string, target: string, revision: number | null, detail: string): void => {
    db.prepare('INSERT INTO enterprise_audit(actor,action,target,revision,created_at,detail) VALUES(?,?,?,?,?,?)').run('shared_host', action, target, revision, new Date().toISOString(), detail)
  }
  return {
    approval(id: string): Approval | null { return read(id) },
    audits(): AuditEntry[] { return db.prepare('SELECT id,actor,action,target,revision,created_at AS createdAt,detail FROM enterprise_audit ORDER BY id DESC').all().map(row => auditSchema.parse(row as Record<string, unknown>)) },
    execute(command: ApprovalCommand, taskRevision: number, archived: boolean): Approval {
      if (archived) throw new GovernanceError(409, 'approvalInvalid')
      db.exec('BEGIN IMMEDIATE')
      try {
        const current = read(command.id)
        if (current && current.revision !== command.expectedRevision) throw new GovernanceError(409, 'approvalConflict')
        const previousStatus = current?.status ?? 'draft'
        const valid = (command.action === 'submit' && (previousStatus === 'draft' || previousStatus === 'rejected'))
          || (command.action === 'approve' && previousStatus === 'submitted')
          || (command.action === 'reject' && previousStatus === 'submitted')
        if (!valid) throw new GovernanceError(409, 'approvalInvalid')
        const status: ApprovalStatus = command.action === 'submit' ? 'submitted' : command.action === 'approve' ? 'approved' : 'rejected'
        const result: Approval = { kind: 'task', id: command.id, revision: taskRevision, status, comment: command.comment, updatedAt: new Date().toISOString() }
        db.prepare('INSERT INTO enterprise_approvals(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(command.id, JSON.stringify(result))
        audit(`approval_${command.action}`, `task:${command.id}`, taskRevision, command.comment)
        db.exec('COMMIT')
        return result
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}
