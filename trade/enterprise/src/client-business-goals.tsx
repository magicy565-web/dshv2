/** Human-owned business objectives reuse the enterprise task editor and persisted records. */
import { useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { businessGoalFields, businessGoalId } from './business-goals-schema.ts'
import type { BusinessGoal, BusinessGoalCommand, BusinessGoalFields } from './business-goals-schema.ts'
import type { EnterpriseTask, TaskCommand } from './tasks-schema.ts'
import { TaskPanel } from './client-tasks.tsx'

type T = PropsLocale<'enterprise'>['t']
const statusKeys = { active: 'businessGoalActive', paused: 'businessGoalPaused', achieved: 'businessGoalAchieved' } as const
const empty: BusinessGoalFields = { title: '', successCriteria: '', owner: '', dueDate: null, status: 'active', outcome: '' }

/**
 * Edit objectives and inspect their tasks without deriving achievement from task counts.
 * @param props - Saved business records, localized copy and existing workspace actions.
 * @returns Goal cards, exact-revision editor and selected goal tasks.
 */
export function BusinessGoalPanel({ goals, tasks, busy, t, command, taskCommand, generate }: {
  goals: BusinessGoal[]; tasks: EnterpriseTask[]; busy: boolean; t: T
  command: (value: BusinessGoalCommand) => Promise<boolean>
  taskCommand: (value: TaskCommand) => Promise<boolean>
  generate: (prompt: string, newSession?: boolean) => Promise<boolean>
}) {
  const [archived, setArchived] = useState(false)
  const [selected, setSelected] = useState<BusinessGoal['id'] | null>(null)
  const [editor, setEditor] = useState<{ id: BusinessGoal['id']; original: BusinessGoal | null; draft: BusinessGoalFields } | null>(null)
  const [failed, setFailed] = useState(false)
  const visible = goals.filter(goal => goal.archived === archived)
  const current = visible.find(goal => goal.id === selected)
  const open = (goal: BusinessGoal | null): void => {
    setFailed(false)
    setEditor({ id: goal?.id ?? businessGoalId.parse(randomUUID()), original: goal, draft: goal ? { title: goal.title, successCriteria: goal.successCriteria, owner: goal.owner, dueDate: goal.dueDate, status: goal.status, outcome: goal.outcome } : { ...empty } })
  }
  const submit = async (): Promise<void> => {
    if (!editor) return
    const fields = businessGoalFields.parse(editor.draft)
    const saved = await command(editor.original ? { action: 'update', id: editor.id, expectedRevision: editor.original.revision, fields } : { action: 'create', id: editor.id, fields })
    if (saved) { setSelected(editor.id); setEditor(null) }
    else setFailed(true)
  }
  return <div className="ent-goals">
    <p className="ent-muted">{t('businessGoalHint')}</p>
    <div className="ent-toolbar"><Button variant="primary" disabled={busy} onClick={() => open(null)}>{t('businessGoalCreate')}</Button><label><input type="checkbox" checked={archived} onChange={event => { setArchived(event.target.checked); setSelected(null) }} /> {t('businessGoalShowArchived')}</label></div>
    {!visible.length && <div className="ent-empty"><h3>{t('businessGoalEmpty')}</h3><p>{t('businessGoalEmptyHint')}</p></div>}
    <div className="ent-task-list">{visible.map(goal => {
      const linked = tasks.filter(task => task.goalId === goal.id && !task.archived)
      return <article className="ent-task-row" key={goal.id}>
        <div><h3>{goal.title}</h3><p className="ent-task-description">{goal.successCriteria}</p><p className="ent-muted">{t(statusKeys[goal.status])} · {goal.owner || t('businessGoalNoOwner')} · {goal.dueDate ?? t('businessGoalNoDue')}</p>
          <p>{t('businessGoalTaskCount', { done: linked.filter(task => task.status === 'done').length, total: linked.length, blocked: linked.filter(task => task.status === 'blocked').length })}</p>
          <p className="ent-task-description">{goal.outcome || t('businessGoalNoOutcome')}</p></div>
        <div className="ent-actions"><Button aria-pressed={selected === goal.id} onClick={() => setSelected(goal.id)}>{t('businessGoalTasks')}</Button>
          {!goal.archived && <><Button disabled={busy} onClick={() => open(goal)}>{t('businessGoalEdit')}</Button><Button disabled={busy} onClick={() => { void generate(t('businessGoalPlanPrompt', { id: goal.id }), true) }}>{t('businessGoalPlan')}</Button></>}
          <Button disabled={busy} onClick={() => { void command({ action: 'archive', id: goal.id, expectedRevision: goal.revision, archived: !goal.archived }) }}>{t(goal.archived ? 'taskRestore' : 'taskArchive')}</Button></div>
      </article>
    })}</div>
    {current && <section className="ent-goal-tasks" aria-label={current.title}><h3>{current.title} · {t('tasks')}</h3><TaskPanel key={current.id} tasks={tasks.filter(task => task.goalId === current.id)} goals={goals} initialGoalId={current.status === 'active' && !current.archived ? current.id : null} allowCreate={current.status === 'active' && !current.archived} busy={busy} t={t} command={taskCommand} /></section>}
    <Modal open={editor !== null} title={t(editor?.original ? 'businessGoalEdit' : 'businessGoalCreate')} closeLabel={t('close')} className="ent-dialog" onClose={() => { if (!busy) setEditor(null) }}>
      {editor && <form className="ent-form" onSubmit={event => { event.preventDefault(); void submit() }}>
        {failed && <p role="alert">{t('businessGoalSaveFailed')}</p>}
        <label className="ent-field"><span>{t('businessGoalTitle')}</span><Input autoFocus required maxLength={240} value={editor.draft.title} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, title: event.target.value } })} /></label>
        <label className="ent-field"><span>{t('businessGoalCriteria')}</span><textarea required maxLength={3000} value={editor.draft.successCriteria} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, successCriteria: event.target.value } })} /></label>
        <label className="ent-field"><span>{t('businessGoalOwner')}</span><Input maxLength={160} value={editor.draft.owner} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, owner: event.target.value } })} /></label>
        <label className="ent-field"><span>{t('businessGoalDue')}</span><Input type="date" value={editor.draft.dueDate ?? ''} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, dueDate: event.target.value || null } })} /></label>
        <label className="ent-field"><span>{t('businessGoalStatus')}</span><select value={editor.draft.status} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, status: event.target.value as BusinessGoalFields['status'] } })}>{(['active', 'paused', 'achieved'] as const).map(status => <option key={status} value={status}>{t(statusKeys[status])}</option>)}</select></label>
        <label className="ent-field"><span>{t('businessGoalOutcome')}</span><textarea required={editor.draft.status === 'achieved'} maxLength={5000} value={editor.draft.outcome} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, outcome: event.target.value } })} /><small>{t(editor.draft.status === 'achieved' ? 'businessGoalCompleteHint' : 'businessGoalOutcomeHint')}</small></label>
        <Button type="submit" variant="primary" disabled={busy || !businessGoalFields.safeParse(editor.draft).success}>{t('save')}</Button>
      </form>}
    </Modal>
  </div>
}
