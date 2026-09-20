/** Native workspace panel for external computer assignments and human acceptance. */
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { computerSnapshot, computerFields, computerJobInput } from './computer-schema.ts'
import type { ComputerBinding, ComputerJob } from './computer-schema.ts'
import type { ComputerLocaleKey } from './computer-locales.ts'
import { auditSchema } from './governance.ts'
import { z } from 'zod'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { computers: ComputerLocaleKey }
}

/** Render bindings, disclosure, execution reports and review controls.
 * @param props - Native locale service.
 * @returns Enterprise cloud computer panel.
 */
export function ComputersPanel({ t }: PropsLocale<'computers'>) {
  const [data, setData] = useState<z.infer<typeof computerSnapshot>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [binding, setBinding] = useState(false)
  const [draft, setDraft] = useState({ name: '', account: '', worker: '', nativeUrl: '', instructions: '' })
  const [computer, setComputer] = useState<ComputerBinding>()
  const [jobId, setJobId] = useState('')
  const [objective, setObjective] = useState('')
  const [context, setContext] = useState('')
  const [outputs, setOutputs] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [token, setToken] = useState<string>()
  const [selected, setSelected] = useState<ComputerJob>()
  const [action, setAction] = useState<'cancel' | 'unknown' | 'review'>()
  const [comment, setComment] = useState('')
  const [verdict, setVerdict] = useState<'SUCCEEDED' | 'PARTIAL' | 'FAILED'>('SUCCEEDED')
  const [disconnect, setDisconnect] = useState<ComputerBinding>()
  const [audit, setAudit] = useState<z.infer<typeof auditSchema>[]>()
  const lifetime = useRef(new AbortController())
  const locked = useRef(false)
  const request = async (body?: unknown, path = '/computers'): Promise<boolean> => {
    if (locked.current) return false
    locked.current = true; setBusy(true); setError(false)
    try {
      const response = await fetch(`/api/enterprise${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal: lifetime.current.signal, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
      if (!response.ok) throw new Error('Computer operation failed')
      const value: unknown = await response.json()
      if (path === '/audit') setAudit(z.array(auditSchema).parse(value).filter(item => item.action.startsWith('computer_')))
      else if (path === '/computers') {
        setData(computerSnapshot.parse(value))
        const credential = z.object({ token: z.string().nullable().optional() }).parse(value).token
        if (credential) setToken(credential)
      }
      return true
    } catch { if (!lifetime.current.signal.aborted) setError(true); return false }
    finally { locked.current = false; if (!lifetime.current.signal.aborted) setBusy(false) }
  }
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; void request(); return () => controller.abort() }, [])
  const jobDraft = { id: jobId, computerId: computer?.id, objective, context, inputFileIds: files, expectedOutputs: outputs.split('\n').map(value => value.trim()).filter(Boolean) }
  const active = (job: ComputerJob) => !['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(job.state)
  return <section className="ent ent-computers"><div className="ent-inner">
    <header className="ent-header"><div><h1>{t('title')}</h1><p>{t('intro')}</p></div><Button disabled={busy} onClick={() => { void request() }}>{t('refresh')}</Button></header>
    <p className="ent-notice">{t('limits')}</p>
    {error && <p role="alert">{t('error')}</p>}
    <div className="ent-actions"><Button variant="primary" disabled={busy} onClick={() => setBinding(true)}>{t('bind')}</Button><Button disabled={busy} onClick={() => { void request(undefined, '/audit') }}>{t('activityLog')}</Button></div>
    {!data?.bindings.length && <p className="ent-empty">{t('empty')}</p>}
    {data?.bindings.map(item => <section className="ent-section" key={item.id}>
      <h2>{item.name}</h2><p>{t('provider')} · {item.worker} · {item.account}</p><p>{t(item.enabled ? 'connected' : 'disconnected')}</p>
      <p className="ent-muted">{t('health')}</p>
      <div className="ent-actions"><a href={item.nativeUrl} target="_blank" rel="noreferrer">{t('open')}</a>
        <Button disabled={busy || !item.enabled} onClick={() => { setComputer(item); setJobId(crypto.randomUUID()); setObjective(''); setContext(''); setOutputs(''); setFiles([]) }}>{t('create')}</Button>
        <Button disabled={busy} onClick={() => { void request({ action: 'rotate', id: item.id }) }}>{t('rotate')}</Button>
        <Button disabled={busy || !item.enabled} onClick={() => setDisconnect(item)}>{t('disconnect')}</Button></div>
      <h3>{t('jobs')}</h3>
      {!data.jobs.some(job => job.computerId === item.id) && <p>{t('noJobs')}</p>}
      {data.jobs.filter(job => job.computerId === item.id).slice().reverse().map(job => <article className="ent-task-row" key={job.id}>
        <div><h3>{job.objective}</h3><p>{t(job.state)}</p><p className="ent-task-description">{job.progress}</p><small>{t('activity')}: {job.lastProgressAt ? new Date(job.lastProgressAt).toLocaleString() : t('noActivity')}</small>
          {job.artifacts.map(artifact => <p key={artifact.fileId}><a href={`/api/enterprise/file?id=${encodeURIComponent(artifact.fileId)}&download=1`}>{artifact.name}</a> · {job.expectedOutputs[artifact.output]}</p>)}
          {job.state === 'WAITING_APPROVAL' && <div><h4>{t('approval')}</h4><p>{job.approvalAction}</p><p className="ent-muted">{t('approvalHelp')}</p>{data.approvals.filter(approval => approval.id === job.approvalTaskId && approval.status === 'submitted').map(approval => <div className="ent-actions" key={approval.id}>{(['approve', 'reject'] as const).map(decision => <Button key={decision} disabled={busy} onClick={() => { void request({ kind: 'task', id: approval.id, expectedRevision: approval.revision, action: decision, comment: job.approvalAction }, '/approvals').then(ok => { if (ok) void request() }) }}>{t(decision)}</Button>)}</div>)}</div>}
        </div><div className="ent-actions"><Button onClick={() => { setSelected(job); setAction(undefined) }}>{t('details')}</Button>
          {active(job) && (job.state === 'VERIFYING' ? ['review', 'cancel'] as const : ['cancel', 'unknown'] as const).map(value => <Button key={value} disabled={busy} onClick={() => { setSelected(job); setAction(value); setComment(''); setVerdict('SUCCEEDED') }}>{t(value)}</Button>)}
        </div></article>)}
    </section>)}
    <Modal open={binding} title={t('bind')} closeLabel={t('close')} onClose={() => { if (!busy) setBinding(false) }} className="ent-dialog">
      <p>{t('isolation')}</p><form className="ent-form" onSubmit={event => { event.preventDefault(); void request({ action: 'bind', fields: draft }).then(ok => { if (ok) setBinding(false) }) }}>
        {(['name', 'account', 'worker', 'nativeUrl', 'instructions'] as const).map(key => <label className="ent-field" key={key}><span>{t(key)}</span>{key === 'instructions' ? <textarea required maxLength={5000} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /> : <Input required maxLength={key === 'nativeUrl' ? 2000 : 160} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />}</label>)}
        {error && <p role="alert">{t('error')}</p>}<Button type="submit" variant="primary" disabled={busy || !computerFields.safeParse(draft).success}>{t('save')}</Button>
      </form>
    </Modal>
    <Modal open={!!token} title={t('credential')} closeLabel={t('close')} onClose={() => setToken(undefined)} className="ent-dialog"><p>{t('credentialHelp')}</p><Input readOnly aria-label={t('credential')} value={token ?? ''} /><p><code>/computer/v1/manifest</code></p></Modal>
    <Modal open={!!computer} title={t('create')} closeLabel={t('close')} onClose={() => { if (!busy) setComputer(undefined) }} className="ent-dialog">
      <p>{t('disclosure')}</p><form className="ent-form" onSubmit={event => { event.preventDefault(); void request({ action: 'create', job: jobDraft }).then(ok => { if (ok) setComputer(undefined) }) }}>
        <label className="ent-field"><span>{t('objective')}</span><Input required maxLength={240} value={objective} onChange={event => setObjective(event.target.value)} /></label>
        <label className="ent-field"><span>{t('context')}</span><textarea required maxLength={10000} value={context} onChange={event => setContext(event.target.value)} /></label>
        <label className="ent-field"><span>{t('outputs')}</span><textarea required value={outputs} onChange={event => setOutputs(event.target.value)} /></label>
        <fieldset><legend>{t('files')}</legend>{data?.files.map(file => <label className="ent-field" key={file.id}><span><input type="checkbox" checked={files.includes(file.id)} onChange={event => setFiles(event.target.checked ? [...files, file.id] : files.filter(id => id !== file.id))} /> {file.name}</span></label>)}</fieldset>
        {error && <p role="alert">{t('error')}</p>}<Button type="submit" variant="primary" disabled={busy || !computerJobInput.safeParse(jobDraft).success}>{t('create')}</Button>
      </form>
    </Modal>
    <Modal open={!!selected} title={action ? t(action) : t('details')} closeLabel={t('close')} onClose={() => { if (!busy) setSelected(undefined) }} className="ent-dialog">
      {selected && <><h3>{selected.objective}</h3><p>{t(selected.state)}</p><p>{t('taskRef')}: {selected.taskId}</p><h4>{t('instructions')}</h4><p className="ent-task-description">{selected.instructions}</p><h4>{t('input')}</h4><p className="ent-task-description">{selected.context}</p><h4>{t('outputs')}</h4><ol>{selected.expectedOutputs.map((output, index) => <li key={index}>{output}</li>)}</ol><p>{selected.result}</p>
        {action && <form className="ent-form" onSubmit={event => { event.preventDefault(); void request({ action, id: selected.id, expectedRevision: selected.revision, comment, ...(action === 'review' ? { verdict } : {}) }).then(ok => { if (ok) setSelected(undefined) }) }}>
          <p>{t(action === 'review' ? 'reviewHelp' : 'cancelHelp')}</p>
          {action === 'review' && <label className="ent-field"><span>{t('verdict')}</span><select value={verdict} onChange={event => setVerdict(event.target.value as typeof verdict)}>{(['SUCCEEDED', 'PARTIAL', 'FAILED'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>}
          <label className="ent-field"><span>{t('comment')}</span><textarea required maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} /></label>
          {error && <p role="alert">{t('error')}</p>}<Button type="submit" disabled={busy || !comment.trim()}>{t('save')}</Button>
        </form>}</>}
    </Modal>
    <Modal open={!!disconnect} title={t('disconnect')} closeLabel={t('close')} onClose={() => { if (!busy) setDisconnect(undefined) }} className="ent-dialog"><p>{t('disconnectHelp')}</p><Button disabled={busy} onClick={() => { void request({ action: 'disconnect', id: disconnect?.id }).then(ok => { if (ok) setDisconnect(undefined) }) }}>{t('disconnect')}</Button></Modal>
    <Modal open={!!audit} title={t('activityLog')} closeLabel={t('close')} onClose={() => setAudit(undefined)} className="ent-dialog"><ol>{audit?.map(entry => <li key={entry.id}><p>{entry.action} · {new Date(entry.createdAt).toLocaleString()}</p><p>{entry.detail}</p></li>)}</ol></Modal>
  </div></section>
}
