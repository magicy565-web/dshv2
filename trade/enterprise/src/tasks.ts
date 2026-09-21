/** Transactional task commands and revision history over the enterprise database. */
import type { DatabaseSync } from 'node:sqlite'
import { taskSchema, taskHistorySchema } from './tasks-schema.ts'
import type { EnterpriseTask, TaskCommand } from './tasks-schema.ts'
import { readBusinessGoal, BusinessGoalError } from './business-goals.ts'

/** Expected business failures, safe to expose through the enterprise route. */
export class TaskError extends Error {
  constructor(readonly status: number, readonly code: 'taskConflict' | 'taskMissing' | 'taskArchived') {
    super(code)
  }
}

/**
 * Access tasks in an already migrated enterprise database.
 * @param db - Database owned and closed by the Host plugin.
 * @returns Transactional commands and validated projections.
 */
export function taskStore(db: DatabaseSync) {
  const read = (id: string): EnterpriseTask => {
    const row = db.prepare('SELECT data FROM enterprise_tasks WHERE id=?').get(id)
    if (!row) throw new TaskError(404, 'taskMissing')
    return taskSchema.parse(JSON.parse(String(row.data)))
  }
  return {
    list: (): EnterpriseTask[] => db.prepare('SELECT data FROM enterprise_tasks ORDER BY rowid DESC').all()
      .map(row => taskSchema.parse(JSON.parse(String(row.data)))),
    history(id: string) {
      read(id)
      return taskHistorySchema.parse(db.prepare('SELECT data FROM enterprise_task_history WHERE task_id=? ORDER BY revision').all(id)
        .map(row => JSON.parse(String(row.data)) as unknown))
    },
    execute(command: TaskCommand): void {
      db.exec('BEGIN IMMEDIATE')
      try {
        const now = new Date().toISOString()
        let task: EnterpriseTask
        let previousGoalId: EnterpriseTask['goalId'] = null
        if (command.action === 'create') {
          if (db.prepare('SELECT id FROM enterprise_tasks WHERE id=?').get(command.id)) throw new TaskError(409, 'taskConflict')
          task = { ...command.fields, id: command.id, revision: 1, archived: false, createdAt: now, updatedAt: now }
        } else {
          const previous = read(command.id)
          previousGoalId = previous.goalId
          if (previous.revision !== command.expectedRevision) throw new TaskError(409, 'taskConflict')
          if (command.action === 'update' && previous.archived) throw new TaskError(409, 'taskArchived')
          task = { ...previous, ...(command.action === 'update' ? command.fields : { archived: command.archived }), revision: previous.revision + 1, updatedAt: now }
        }
        if (task.goalId !== null && task.goalId !== previousGoalId) {
          const goal = readBusinessGoal(db, task.goalId)
          if (goal.archived || goal.status !== 'active') throw new BusinessGoalError(409, 'businessGoalInactive')
        }
        db.prepare('INSERT INTO enterprise_tasks(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
          .run(task.id, JSON.stringify(task))
        db.prepare('INSERT INTO enterprise_task_history(task_id,revision,data) VALUES(?,?,?)')
          .run(task.id, task.revision, JSON.stringify({ action: command.action, actor: 'shared_host', task }))
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
}
