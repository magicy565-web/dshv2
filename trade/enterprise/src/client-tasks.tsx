/** Enterprise task board; assignee labels do not grant resource access. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { taskFields, taskId, taskHistorySchema } from './tasks-schema.ts'
import type { EnterpriseTask, TaskCommand, TaskFields } from './tasks-schema.ts'
import { businessGoalId } from './business-goals-schema.ts'
import type { BusinessGoal } from './business-goals-schema.ts'
import { Alert, Avatar, Button, Dialog, SearchInput, Select, StatusIcon, Tag, TextArea, TextField, Toast } from './workbench-ui.tsx'
import { IconEditOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StatusIconName } from './workbench-ui.tsx'
import { ProfileIcon } from './profile-icons.tsx'

type T = PropsLocale<'enterprise'>['t']
const statuses = ['todo', 'in_progress', 'blocked', 'done'] as const
type Status = (typeof statuses)[number]
const statusKey = { todo: 'taskTodo', in_progress: 'taskInProgress', blocked: 'taskBlocked', done: 'taskDone' } as const
const statusIcon: Record<Status, StatusIconName> = { todo: 'todo', in_progress: 'inprogress', blocked: 'blocked', done: 'done' }
const empty: TaskFields = { title: '', description: '', assignee: '', dueDate: null, status: 'todo', goalId: null, outcome: '' }

function fieldsOf(task: EnterpriseTask): TaskFields {
  const { title, description, assignee, dueDate, status, goalId, outcome } = task
  return { title, description, assignee, dueDate, status, goalId, outcome }
}

/** Due label and tone for a task card. */
export function dueLabel(task: EnterpriseTask, now: number, t: T): { text: string; tone?: 'soon' | 'over' } {
  if (!task.dueDate) return { text: t('taskNoDueDate') }
  const days = Math.floor((Date.parse(`${task.dueDate}T00:00:00Z`) - now) / 86400000)
  if (days < 0) return { text: t('taskOverdue', { n: -days }), tone: 'over' }
  if (days === 0) return { text: t('taskDueToday'), tone: 'soon' }
  if (days <= 3) return { text: t('taskDueSoon', { n: days }), tone: 'soon' }
  return { text: `${t('taskDuePrefix')} ${task.dueDate}` }
}

function History({ task, t }: { task: EnterpriseTask; t: T }) {
  const [history, setHistory] = useState<ReturnType<typeof taskHistorySchema.parse> | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/enterprise/tasks/history?id=${encodeURIComponent(task.id)}`, { signal: controller.signal, credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) throw new Error('Task history unavailable')
        const records = taskHistorySchema.parse(await response.json())
        if (!controller.signal.aborted) setHistory(records)
      }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [task.id])
  if (failed) return <Alert tone="error">{t('serverError')}</Alert>
  if (!history) return <p role="status">{t('loading')}</p>
  return <ol className="ent-task-history">{history.map(record => <li key={record.task.revision}>
    <strong>{t('taskRevision', { n: record.task.revision })} · {record.task.title}</strong>
    <p>{t(statusKey[record.task.status])} · {record.task.archived ? t('taskArchivedLabel') : t('taskActive')} · {record.task.assignee || t('taskUnassigned')}</p>
    <p>{record.task.dueDate ?? t('taskNoDueDate')} · {new Date(record.task.updatedAt).toLocaleString()}</p>
    <p className="ent-task-description">{record.task.description}</p>{record.task.goalId && <p>{t('taskGoal')}: {record.task.goalId}</p>}{record.task.outcome && <p className="ent-task-description">{t('taskOutcome')}: {record.task.outcome}</p>}<small>{t('taskSharedActor')}</small>
  </li>)}</ol>
}

/** One card on the board; the status select moves it, the edit button opens the editor. */
function TaskCard({ task, goalTitle, now, busy, t, onStatus, onOpen }: { task: EnterpriseTask; goalTitle: string | null; now: number; busy: boolean; t: T; onStatus: (status: Status) => void; onOpen: () => void }) {
  const due = dueLabel(task, now, t)
  return <div className="wb-card">
    <div className="wb-card-top">
      <StatusIcon status={statusIcon[task.status]} />
      <span className="wb-card-title">{task.title}</span>
    </div>
    <div className="wb-card-meta">
      <span className="wb-card-due" data-tone={due.tone}><ProfileIcon name="calendar" size={11} />{due.text}</span>
      {goalTitle && <span className="wb-card-goal"><Tag label={goalTitle} /></span>}
    </div>
    {task.status === 'done' && task.outcome && <p className="wb-card-outcome">{task.outcome}</p>}
    <div className="wb-card-foot">
      {task.assignee ? <Avatar label={task.assignee} size={20} /> : <span className="wb-card-meta">{t('taskUnassigned')}</span>}
      <span className="wb-card-actions">
        <select className="wb-card-status" aria-label={`${t('taskStatus')} ${task.title}`} value={task.status} disabled={busy || task.archived} onChange={event => onStatus(event.target.value as Status)}>{statuses.map(status => <option key={status} value={status}>{t(statusKey[status])}</option>)}</select>
        <button type="button" className="wb-card-edit" title={t('taskEdit')} aria-label={t('taskEdit')} disabled={busy} onClick={onOpen}><IconEditOutline16 /></button>
      </span>
    </div>
  </div>
}

/**
 * Render the task board: four status columns with search, filters and feedback.
 * @param props - Tasks, goals, busy state, locale, mutation command and AI drafting hook.
 * @returns The board plus editor, history and feedback overlays.
 */
export function TaskPanel({ tasks, goals, busy, t, command, initialGoalId = null, allowCreate = true, draftWithAi }: { tasks: EnterpriseTask[]; goals: BusinessGoal[]; busy: boolean; t: T; command: (value: TaskCommand) => Promise<boolean>; initialGoalId?: BusinessGoal['id'] | null; allowCreate?: boolean; draftWithAi?: (() => void) | undefined }) {
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [goalFilter, setGoalFilter] = useState<string>('all')
  const [editor, setEditor] = useState<{ original: EnterpriseTask | null; id: EnterpriseTask['id']; draft: TaskFields } | null>(null)
  const [history, setHistory] = useState<EnterpriseTask | null>(null)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const now = Date.now()

  const goalTitle = (id: EnterpriseTask['goalId']) => id ? goals.find(goal => goal.id === id)?.title ?? null : null
  const flash = (tone: 'success' | 'info', text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ tone, text })
    noticeTimer.current = setTimeout(() => setNotice(null), 3200)
  }
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  const visible = useMemo(() => tasks
    .filter(task => task.archived === archived)
    .filter(task => statusFilter === 'all' || task.status === statusFilter)
    .filter(task => goalFilter === 'all' || task.goalId === goalFilter)
    .filter(task => `${task.title} ${task.assignee}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return b.updatedAt.localeCompare(a.updatedAt)
    }), [tasks, archived, statusFilter, goalFilter, search])
  const columns = useMemo(() => statuses.map(status => ({ status, items: visible.filter(task => task.status === status) })), [visible])
  const hasFilters = search !== '' || statusFilter !== 'all' || goalFilter !== 'all'

  const updateStatus = async (task: EnterpriseTask, status: Status): Promise<void> => {
    const fields = { ...fieldsOf(task), status }
    if (!taskFields.safeParse(fields).success) { setFailed(false); setEditor({ original: task, id: task.id, draft: fields }); return }
    if (await command({ action: 'update', id: task.id, expectedRevision: task.revision, fields })) flash('success', t('taskStatusChanged', { status: t(statusKey[status]) }))
    else setFailed(true)
  }
  const submit = async (): Promise<void> => {
    if (!editor) return
    const fields = taskFields.parse(editor.draft)
    const ok = await command(editor.original
      ? { action: 'update', id: editor.id, expectedRevision: editor.original.revision, fields }
      : { action: 'create', id: editor.id, fields })
    if (ok) { setEditor(null); flash('success', t(editor.original ? 'taskUpdatedToast' : 'taskCreatedToast')) }
    else setFailed(true)
  }
  const openCreate = (status: Status = 'todo') => { setFailed(false); setEditor({ original: null, id: taskId.parse(randomUUID()), draft: { ...empty, status, goalId: initialGoalId } }) }

  return <div className="wb-board">
    <div className="wb-board-head">
      <div><h1>{t('taskBoard')}</h1><p>{t('taskBoardHint')}</p></div>
      <div className="wb-board-tools">
        <SearchInput value={search} placeholder={t('taskSearch')} clearLabel={t('taskClearSelection')} onChange={setSearch} onClear={() => setSearch('')} />
        <Select options={[{ value: 'all', label: t('taskAllStatuses') }, ...statuses.map(status => ({ value: status, label: t(statusKey[status]) }))]} value={statusFilter} onChange={value => setStatusFilter(value as Status | 'all')} />
        <Select options={[{ value: 'all', label: t('taskAllGoals') }, ...goals.filter(goal => !goal.archived).map(goal => ({ value: goal.id, label: goal.title }))]} value={goalFilter} onChange={setGoalFilter} />
        <Button tone="ghost" size="sm" onActivate={() => setArchived(!archived)}>{t('taskShowArchived')}</Button>
        {allowCreate && <Button size="sm" onActivate={() => openCreate()}>{t('taskCreate')}</Button>}
      </div>
    </div>
    {failed && <Alert tone="error" title={t('taskSaveFailed')}>{t('taskConflict')}</Alert>}
    {visible.length === 0 && (hasFilters
      ? <Alert tone="info" title={t('taskNoMatchTitle')} action={<Button tone="secondary" size="sm" onActivate={() => { setSearch(''); setStatusFilter('all'); setGoalFilter('all') }}>{t('taskClearFilters')}</Button>}>{t('taskNoMatchHint')}</Alert>
      : <div className="wb-emptyslot">
          <ProfileIcon name="case" size={18} />
          <strong>{t('taskEmptyTitle')}</strong>
          <span>{t('taskEmptyHint')}</span>
          <span style={{ display: 'inline-flex', gap: 10, marginTop: 6 }}>
            {allowCreate && <Button size="sm" onActivate={() => openCreate()}>{`${t('taskCreate')} · ${t('taskAllStatuses')}`}</Button>}
            {draftWithAi && <Button size="sm" tone="secondary" onActivate={draftWithAi}>{t('taskEmptyAction')}</Button>}
          </span>
        </div>)}
    <div className="wb-board-cols">
      {columns.map(column => <section key={column.status} className="wb-board-col" aria-label={t(statusKey[column.status])}>
        <header className="wb-board-colhead">
          <StatusIcon status={statusIcon[column.status]} />
          <strong>{t(statusKey[column.status])}</strong>
          <span className="wb-board-count">{column.items.length}</span>
        </header>
        {column.items.map(task => <TaskCard key={task.id} task={task} goalTitle={goalTitle(task.goalId)} now={now} busy={busy} t={t}
          onStatus={status => void updateStatus(task, status)}
          onOpen={() => { setFailed(false); setEditor({ original: task, id: task.id, draft: fieldsOf(task) }) }} />)}
        {allowCreate && !archived && <button type="button" className="wb-board-add" onClick={() => openCreate(column.status)}><ProfileIcon name="plus" size={13} />{`${t('taskCreate')} · ${t(statusKey[column.status])}`}</button>}
      </section>)}
    </div>
    {history && <Dialog title={t('taskHistory')} label={t('taskViewHistory')} onClose={() => setHistory(null)}><History key={history.id} task={history} t={t} /></Dialog>}
    {editor && <Dialog title={t(editor.original ? 'taskEdit' : 'taskCreate')} label={t(editor.original ? 'taskEdit' : 'taskCreate')} onClose={() => { if (!busy) setEditor(null) }}
      actions={<>
        {editor.original && <Button tone="ghost" size="sm" onActivate={() => { if (editor.original) { setHistory(editor.original); setEditor(null) } }}>{t('taskHistory')}</Button>}
        <Button tone="secondary" size="sm" onActivate={() => { if (!busy) setEditor(null) }}>{t('cancel')}</Button>
        <Button size="sm" loading={busy} disabled={!taskFields.safeParse(editor.draft).success} onActivate={() => void submit()}>{t('save')}</Button>
      </>}>
      <form className="ent-form" onSubmit={event => { event.preventDefault(); void submit() }}>
        {failed && <Alert tone="error">{t('taskSaveFailed')}</Alert>}
        <TextField label={t('taskTitle')} value={editor.draft.title} onChange={value => setEditor({ ...editor, draft: { ...editor.draft, title: value } })} />
        <TextArea label={t('taskDescription')} value={editor.draft.description} onChange={value => setEditor({ ...editor, draft: { ...editor.draft, description: value } })} />
        <Select label={t('taskGoal')} options={[{ value: '', label: t('taskNoGoal') }, ...goals.filter(goal => goal.id === editor.original?.goalId || (!goal.archived && goal.status === 'active')).map(goal => ({ value: goal.id, label: goal.title }))]} value={editor.draft.goalId ?? ''} onChange={value => setEditor({ ...editor, draft: { ...editor.draft, goalId: value ? businessGoalId.parse(value) : null } })} />
        <TextField label={t('taskAssignee')} value={editor.draft.assignee} onChange={value => setEditor({ ...editor, draft: { ...editor.draft, assignee: value } })} />
        <label className="wb-field"><span className="wb-field-label">{t('taskDueDate')}</span><input className="wb-input" type="date" value={editor.draft.dueDate ?? ''} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, dueDate: event.target.value || null } })} /></label>
        <Select label={t('taskStatus')} options={statuses.map(status => ({ value: status, label: t(statusKey[status]) }))} value={editor.draft.status} onChange={value => setEditor({ ...editor, draft: { ...editor.draft, status: value as Status } })} />
        <TextArea label={t('taskOutcome')} hint={t('taskOutcomeHint')} value={editor.draft.outcome} onChange={value => setEditor({ ...editor, draft: { ...editor.draft, outcome: value } })} />
      </form>
    </Dialog>}
    {notice && <div className="wb-toast-stack"><Toast tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}
  </div>
}
