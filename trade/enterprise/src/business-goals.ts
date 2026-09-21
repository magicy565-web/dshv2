/** Enterprise business objectives and task attribution share one transactional database. */
import type { DatabaseSync } from 'node:sqlite'
import { businessGoalSchema } from './business-goals-schema.ts'
import type { BusinessGoal, BusinessGoalCommand } from './business-goals-schema.ts'
import { taskSchema, taskActivitySchema } from './tasks-schema.ts'

/** Expected failures exposed as localized workspace errors. */
export class BusinessGoalError extends Error {
  constructor(readonly status: number, readonly code: 'businessGoalConflict' | 'businessGoalMissing' | 'businessGoalArchived' | 'businessGoalInactive') { super(code) }
}

/**
 * Apply enterprise schema generation 15 without assigning existing work to a goal.
 * @param db - Enterprise database after migrations through generation 14.
 */
export function migrateBusinessGoals(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('CREATE TABLE enterprise_goals (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
    for (const row of db.prepare('SELECT id,data FROM enterprise_tasks').all()) {
      const task = taskSchema.parse({ ...JSON.parse(String(row.data)), goalId: null, outcome: '' })
      db.prepare('UPDATE enterprise_tasks SET data=? WHERE id=?').run(JSON.stringify(task), String(row.id))
    }
    for (const row of db.prepare('SELECT task_id,revision,data FROM enterprise_task_history').all()) {
      const record = JSON.parse(String(row.data))
      const activity = taskActivitySchema.parse({ ...record, task: { ...record.task, goalId: null, outcome: '' } })
      db.prepare('UPDATE enterprise_task_history SET data=? WHERE task_id=? AND revision=?').run(JSON.stringify(activity), String(row.task_id), Number(row.revision))
    }
    db.exec('PRAGMA user_version=15; COMMIT;')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

/**
 * Read one stored objective or reject a missing reference.
 * @param db - Migrated enterprise database.
 * @param id - Objective identity supplied by a validated consumer.
 * @returns Detached, validated objective.
 */
export function readBusinessGoal(db: DatabaseSync, id: BusinessGoal['id']): BusinessGoal {
  const row = db.prepare('SELECT data FROM enterprise_goals WHERE id=?').get(id)
  if (!row) throw new BusinessGoalError(404, 'businessGoalMissing')
  return businessGoalSchema.parse(JSON.parse(String(row.data)))
}

/**
 * Own business-goal edits and their full audit records.
 * @param db - Migrated database owned and closed by the enterprise Host.
 * @returns Reads and atomic commands; task completion never completes a goal.
 */
export function businessGoalStore(db: DatabaseSync) {
  return {
    list: (): BusinessGoal[] => db.prepare('SELECT data FROM enterprise_goals ORDER BY rowid DESC').all()
      .map(row => businessGoalSchema.parse(JSON.parse(String(row.data)))),
    get: (id: BusinessGoal['id']) => readBusinessGoal(db, id),
    execute(command: BusinessGoalCommand): BusinessGoal {
      db.exec('BEGIN IMMEDIATE')
      try {
        const now = new Date().toISOString()
        let goal: BusinessGoal
        if (command.action === 'create') {
          if (db.prepare('SELECT id FROM enterprise_goals WHERE id=?').get(command.id)) throw new BusinessGoalError(409, 'businessGoalConflict')
          goal = { ...command.fields, id: command.id, revision: 1, archived: false, createdAt: now, updatedAt: now }
        } else {
          const previous = readBusinessGoal(db, command.id)
          if (previous.revision !== command.expectedRevision) throw new BusinessGoalError(409, 'businessGoalConflict')
          if (command.action === 'update' && previous.archived) throw new BusinessGoalError(409, 'businessGoalArchived')
          goal = { ...previous, ...(command.action === 'update' ? command.fields : { archived: command.archived }), revision: previous.revision + 1, updatedAt: now }
        }
        db.prepare('INSERT INTO enterprise_goals(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(goal.id, JSON.stringify(goal))
        db.prepare('INSERT INTO enterprise_audit(actor,action,target,revision,created_at,detail) VALUES(?,?,?,?,?,?)')
          .run('shared_host', `goal_${command.action}`, `goal:${goal.id}`, goal.revision, now, JSON.stringify(goal))
        db.exec('COMMIT')
        return goal
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}
