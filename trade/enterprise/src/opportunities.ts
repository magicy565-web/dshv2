/** Transactional overseas-buyer opportunity storage. */
import type { DatabaseSync } from 'node:sqlite'
import { opportunitySchema } from './opportunities-schema.ts'
import type { EnterpriseOpportunity, OpportunityCommand } from './opportunities-schema.ts'

/** Expected opportunity failures safe to expose through authenticated surfaces. */
export class OpportunityError extends Error {
  constructor(readonly status: number, readonly code: 'opportunityConflict' | 'opportunityMissing' | 'opportunityArchived') {
    super(code)
  }
}

/**
 * Access opportunities in an already migrated enterprise database.
 * @param db - Database owned and closed by the Host plugin.
 * @returns Validated reads and transactional commands.
 */
export function opportunityStore(db: DatabaseSync) {
  const read = (id: string): EnterpriseOpportunity => {
    const row = db.prepare('SELECT data FROM enterprise_opportunities WHERE id=?').get(id)
    if (!row) throw new OpportunityError(404, 'opportunityMissing')
    return opportunitySchema.parse(JSON.parse(String(row.data)))
  }
  return {
    list: (): EnterpriseOpportunity[] => db.prepare('SELECT data FROM enterprise_opportunities ORDER BY rowid DESC').all()
      .map(row => opportunitySchema.parse(JSON.parse(String(row.data)))),
    get: (id: string): EnterpriseOpportunity => read(id),
    execute(command: OpportunityCommand): EnterpriseOpportunity {
      db.exec('BEGIN IMMEDIATE')
      try {
        const now = new Date().toISOString()
        let opportunity: EnterpriseOpportunity
        if (command.action === 'create') {
          if (db.prepare('SELECT id FROM enterprise_opportunities WHERE id=?').get(command.id)) throw new OpportunityError(409, 'opportunityConflict')
          opportunity = { ...command.fields, id: command.id, revision: 1, archived: false, createdAt: now, updatedAt: now }
        } else {
          const previous = read(command.id)
          if (previous.revision !== command.expectedRevision) throw new OpportunityError(409, 'opportunityConflict')
          if (command.action === 'update' && previous.archived) throw new OpportunityError(409, 'opportunityArchived')
          opportunity = { ...previous, ...(command.action === 'update' ? command.fields : { archived: command.archived }), revision: previous.revision + 1, updatedAt: now }
        }
        db.prepare('INSERT INTO enterprise_opportunities(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
          .run(opportunity.id, JSON.stringify(opportunity))
        db.exec('COMMIT')
        return opportunity
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}

