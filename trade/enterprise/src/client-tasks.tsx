/** Enterprise task editor; assignee labels do not grant resource access. */
import { useEffect, useState } from 'react'
import { Button, Input, Modal, IconPlusOutline16, IconEditOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { taskFields, taskId, taskHistorySchema } from './tasks-schema.ts'
import type { EnterpriseTask, TaskCommand, TaskFields } from './tasks-schema.ts'

type T = PropsLocale<'enterprise'>['t']
const statuses = ['todo', 'in_progress', 'blocked', 'done'] as const
const statusKey = { todo: 'taskTodo', in_progress: 'taskInProgress', blocked: 'taskBlocked', done: 'taskDone' } as const
const empty: TaskFields = { title: '', description: '', assignee: '', dueDate: null, status: 'todo' }

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
  if (failed) return <p role="alert">{t('serverError')}</p>
  if (!history) return <p role="status">{t('loading')}</p>
  return <ol className="ent-task-history">{history.map(record => <li key={record.task.revision}>
    <strong>{t('taskRevision', { n: record.task.revision })} · {record.task.title}</strong>
    <p>{t(statusKey[record.task.status])} · {record.task.archived ? t('taskArchivedLabel') : t('taskActive')} · {record.task.assignee || t('taskUnassigned')}</p>
    <p>{record.task.dueDate ?? t('taskNoDueDate')} · {new Date(record.task.updatedAt).toLocaleString()}</p>
    <p className="ent-task-description">{record.task.description}</p><small>{t('taskSharedActor')}</small>
  </li>)}</ol>
}

/**
 * Render tasks independently of Session planning.
 * @param props - Tasks, busy state, locale, and mutation command.
 * @returns Task list and editing dialogs.
 */
export function TaskPanel({ tasks, busy, t, command }: { tasks: EnterpriseTask[]; busy: boolean; t: T; command: (value: TaskCommand) => Promise<boolean> }) {
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ original: EnterpriseTask | null; id: EnterpriseTask['id']; draft: TaskFields } | null>(null)
  const [history, setHistory] = useState<EnterpriseTask | null>(null)
  const [failed, setFailed] = useState(false)
  const visible = tasks.filter(task => task.archived === archived && `${task.title} ${task.assignee}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const submit = async (): Promise<void> => {
    if (!editor) return
    const fields = taskFields.parse(editor.draft)
    const ok = await command(editor.original
      ? { action: 'update', id: editor.id, expectedRevision: editor.original.revision, fields }
      : { action: 'create', id: editor.id, fields })
    if (ok) setEditor(null)
    else setFailed(true)
  }
  return <div>
    <div className="ent-toolbar">
      <Button icon={<IconPlusOutline16 />} variant="primary" disabled={busy} onClick={() => { setFailed(false); setEditor({ original: null, id: taskId.parse(crypto.randomUUID()), draft: { ...empty } }) }}>{t('taskCreate')}</Button>
      <Input aria-label={t('taskSearch')} placeholder={t('taskSearch')} value={search} onChange={event => setSearch(event.target.value)} />
      <label><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> {t('taskShowArchived')}</label>
    </div>
    {!visible.length && <p className="ent-empty">{t('taskEmpty')}</p>}
    <div className="ent-task-list">{visible.map(task => <article className="ent-task-row" key={task.id}>
      <div><h3>{task.title}</h3><p className="ent-task-description">{task.description}</p><p className="ent-muted">{task.assignee || t('taskUnassigned')} · {task.dueDate ?? t('taskNoDueDate')} · {t('taskRevision', { n: task.revision })}</p></div>
      <div className="ent-actions">
        <select aria-label={`${t('taskStatus')} ${task.title}`} value={task.status} disabled={busy || task.archived} onChange={event => { const { title, description, assignee, dueDate } = task; void command({ action: 'update', id: task.id, expectedRevision: task.revision, fields: { title, description, assignee, dueDate, status: event.target.value as TaskFields['status'] } }) }}>{statuses.map(status => <option value={status} key={status}>{t(statusKey[status])}</option>)}</select>
        {!task.archived && <Button title={t('taskEdit')} aria-label={t('taskEdit')} disabled={busy} onClick={() => { setFailed(false); const { title, description, assignee, dueDate, status } = task; setEditor({ original: task, id: task.id, draft: { title, description, assignee, dueDate, status } }) }}><IconEditOutline16 /></Button>}
        <Button disabled={busy} onClick={() => setHistory(task)}>{t('taskHistory')}</Button>
        <Button disabled={busy} onClick={() => { void command({ action: 'archive', id: task.id, expectedRevision: task.revision, archived: !task.archived }) }}>{t(task.archived ? 'taskRestore' : 'taskArchive')}</Button>
      </div>
    </article>)}</div>
    <Modal open={editor !== null} title={t(editor?.original ? 'taskEdit' : 'taskCreate')} closeLabel={t('close')} className="ent-dialog" onClose={() => { if (!busy) setEditor(null) }}>
      {editor && <form className="ent-form" onSubmit={event => { event.preventDefault(); void submit() }}>
        {failed && <p role="alert">{t('taskSaveFailed')}</p>}
        <label className="ent-field"><span>{t('taskTitle')}</span><Input autoFocus required maxLength={240} value={editor.draft.title} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, title: event.target.value } })} /></label>
        <label className="ent-field"><span>{t('taskDescription')}</span><textarea maxLength={5000} value={editor.draft.description} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, description: event.target.value } })} /></label>
        <label className="ent-field"><span>{t('taskAssignee')}</span><Input maxLength={160} value={editor.draft.assignee} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, assignee: event.target.value } })} /></label>
        <label className="ent-field"><span>{t('taskDueDate')}</span><Input type="date" value={editor.draft.dueDate ?? ''} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, dueDate: event.target.value || null } })} /></label>
        <label className="ent-field"><span>{t('taskStatus')}</span><select value={editor.draft.status} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, status: event.target.value as TaskFields['status'] } })}>{statuses.map(status => <option key={status} value={status}>{t(statusKey[status])}</option>)}</select></label>
        <Button type="submit" variant="primary" disabled={busy || !taskFields.safeParse(editor.draft).success}>{t('save')}</Button>
      </form>}
    </Modal>
    <Modal open={history !== null} title={t('taskHistory')} closeLabel={t('close')} className="ent-dialog" onClose={() => setHistory(null)}>{history && <History key={history.id} task={history} t={t} />}</Modal>
  </div>
}
