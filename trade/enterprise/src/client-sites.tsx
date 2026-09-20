/** Sites management reads persisted revisions; browser state never stands in for saved source. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button, Input, IconPlusOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SiteLocaleKey } from './site-locales.ts'
import { SiteHostingPanel } from './client-site-hosting.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sites: SiteLocaleKey }
}

const siteSchema = z.object({ id: z.string(), name: z.string(), currentRevisionId: z.string().optional(), liveRevisionId: z.string().optional(), availability: z.enum(['unknown', 'online', 'offline']).optional() })
const versionSchema = z.object({ id: z.string(), createdAt: z.string(), source: z.enum(['user', 'agent', 'rollback']) })
const projectSchema = z.object({ framework: z.enum(['static', 'nextjs']), files: z.array(z.object({ path: z.string(), content: z.string(), encoding: z.enum(['utf8', 'base64']) })) })
type Site = z.infer<typeof siteSchema>
type Version = z.infer<typeof versionSchema>
type Project = z.infer<typeof projectSchema>
type Props = PropsLocale<'sites'> & { generate: (prompt: string, newSession?: boolean) => Promise<boolean> }

async function request(query: Record<string, string>, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/enterprise/sites?${new URLSearchParams(query)}`, {
    signal, credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'error')
  return response.json()
}

/** Display workspace sites, private previews, source editing and immutable version history.
 * @param props - Localized copy and the existing conversation entry action.
 * @returns The Sites management panel.
 */
export function SitesPanel({ t, generate }: Props) {
  const [sites, setSites] = useState<Site[]>([])
  const [selected, setSelected] = useState<string>()
  const [revision, setRevision] = useState<string>()
  const [versions, setVersions] = useState<Version[]>([])
  const [project, setProject] = useState<Project>()
  const [filePath, setFilePath] = useState('index.html')
  const [newPath, setNewPath] = useState('')
  const [prompt, setPrompt] = useState('')
  const [tab, setTab] = useState<'preview' | 'code'>('preview')
  const [mobile, setMobile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<'error' | 'conflict'>()
  const [refresh, setRefresh] = useState(0)
  const lifetime = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void request({}, controller.signal).then(value => {
      setSites(z.object({ items: z.array(siteSchema) }).parse(value).items)
      setError(undefined)
    }).catch(() => { if (!controller.signal.aborted) setError('error') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])
  const site = sites.find(item => item.id === selected)
  const selectedRevision = revision ?? site?.currentRevisionId
  useEffect(() => {
    setProject(undefined)
    setVersions([])
    if (!selected) return
    const controller = new AbortController()
    void request({ siteId: selected, action: 'revisions' }, controller.signal).then(value => setVersions(z.object({ items: z.array(versionSchema) }).parse(value).items))
      .catch(() => { if (!controller.signal.aborted) setError('error') })
    return () => controller.abort()
  }, [selected, refresh])
  useEffect(() => {
    setProject(undefined)
    if (!selected || !selectedRevision) return
    const controller = new AbortController()
    void request({ siteId: selected, action: 'content', revisionId: selectedRevision }, controller.signal).then(value => {
      const content = z.object({ project: projectSchema.optional() }).parse(value)
      setProject(content.project)
      setFilePath(content.project?.files[0]?.path ?? 'index.html')
    }).catch(() => { if (!controller.signal.aborted) setError('error') })
    return () => controller.abort()
  }, [selected, selectedRevision, refresh])
  const action = async (run: () => Promise<void>): Promise<void> => {
    const signal = lifetime.current.signal
    if (busy || signal.aborted) return
    setBusy(true); setError(undefined)
    try { await run() }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error && cause.message === 'conflict' ? 'conflict' : 'error') }
    finally { if (!signal.aborted) setBusy(false) }
  }
  const start = () => action(async () => {
    const message = selected ? t('changePrompt', { id: selected, prompt }) : t('createPrompt', { prompt })
    if (!await generate(message, true)) throw new Error('error')
  })
  const save = () => action(async () => {
    if (!site || !project) return
    const result = versionSchema.parse(await request({ siteId: site.id, action: 'revisions' }, lifetime.current.signal, { changeSet: { ...(site.currentRevisionId ? { baseRevisionId: site.currentRevisionId } : {}), project } }))
    setRevision(result.id); setRefresh(value => value + 1)
  })
  const restore = () => action(async () => {
    if (!site || !selectedRevision) return
    const result = versionSchema.parse(await request({ siteId: site.id, action: 'rollback' }, lifetime.current.signal, { revisionId: selectedRevision, expectedRevisionId: site.currentRevisionId }))
    setRevision(result.id); setRefresh(value => value + 1)
  })
  const activeFile = project?.files.find(file => file.path === filePath)
  const exportSource = () => {
    if (!project) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `${site?.id ?? 'site'}.json`; anchor.click()
    URL.revokeObjectURL(url)
  }
  return <section className="ent site-workspace"><div className="site-shell">
    <header className="ent-header"><div><h1>{t('title')}</h1><p className="ent-muted">{t('subtitle')}</p></div><div className="ent-actions"><Button disabled={busy} onClick={() => setRefresh(value => value + 1)}>{t('refresh')}</Button><Button icon={<IconPlusOutline16 />} onClick={() => { setSelected(undefined); setRevision(undefined); setPrompt('') }}>{t('create')}</Button></div></header>
    {error && <p role="alert" className="ent-notice">{t(error)}</p>}
    <div className="site-layout"><aside className="site-list" aria-label={t('title')}>{loading && <p role="status">{t('loading')}</p>}{sites.map(item => <button className="site-card" key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setRevision(undefined); setPrompt(''); setError(undefined) }}><span className="site-card-icon" aria-hidden="true">↗</span><strong>{item.name}</strong><span className="ent-muted">{t(item.availability ?? (item.liveRevisionId ? 'published' : 'draft'))}</span></button>)}</aside>
    <main className="site-main">{!site ? <div className="site-welcome"><div className="site-orb" aria-hidden="true">✳</div><h2>{t('empty')}</h2><p className="ent-muted">{t('emptyDetail')}</p></div> : <>
      <div className="site-toolbar"><h2>{site.name}</h2></div>
      {selectedRevision ? <><div className="site-toolbar"><nav className="ent-tabs">{(['preview', 'code'] as const).map(value => <button className="ent-tab" aria-pressed={tab === value} key={value} onClick={() => setTab(value)}>{t(value)}</button>)}</nav><label>{t('history')} <select aria-label={t('history')} value={selectedRevision} onChange={event => setRevision(event.target.value)}>{versions.map(version => <option key={version.id} value={version.id}>{new Date(version.createdAt).toLocaleString()} · {t(version.source)}</option>)}</select></label><Button disabled={busy || selectedRevision === site.currentRevisionId} onClick={() => { void restore() }}>{t('restore')}</Button></div>
      {tab === 'preview' ? <><div className="site-toolbar"><Button onClick={() => setMobile(false)} aria-pressed={!mobile}>{t('desktop')}</Button><Button onClick={() => setMobile(true)} aria-pressed={mobile}>{t('mobile')}</Button></div>{project?.framework === 'nextjs' ? <p>{t('buildNext')}</p> : project ? <div className="site-preview"><iframe title={t('preview')} sandbox="allow-scripts" style={{ width: mobile ? 'min(390px, 100%)' : '100%' }} src={`/api/enterprise/sites?${new URLSearchParams({ siteId: site.id, revisionId: selectedRevision, action: 'preview' })}`} /></div> : <p className="ent-empty">{t('noProject')}</p>}</>
      : project ? <><div className="site-toolbar"><select aria-label={t('files')} value={filePath} onChange={event => setFilePath(event.target.value)}>{project.files.map(file => <option value={file.path} key={file.path}>{file.path}</option>)}</select><Button onClick={exportSource}>{t('export')}</Button><Button variant="primary" disabled={busy} onClick={() => { void save() }}>{t(busy ? 'saving' : 'save')}</Button></div>{activeFile?.encoding === 'utf8' ? <textarea className="site-code" spellCheck={false} aria-label={t('code')} value={activeFile.content} onChange={event => setProject({ ...project, files: project.files.map(file => file.path === filePath ? { ...file, content: event.target.value } : file) })} /> : <p>{t(activeFile ? 'binary' : 'noFiles')}</p>}<div className="site-toolbar"><Input aria-label={t('fileName')} placeholder={t('fileName')} value={newPath} onChange={event => setNewPath(event.target.value)} /><Button disabled={!newPath.trim() || project.files.some(file => file.path === newPath.trim())} onClick={() => { const path = newPath.trim(); setProject({ ...project, files: [...project.files, { path, content: '', encoding: 'utf8' }] }); setFilePath(path); setNewPath('') }}>{t('addFile')}</Button><Button disabled={!activeFile} onClick={() => setProject({ ...project, files: project.files.filter(file => file.path !== filePath) })}>{t('removeFile')}</Button></div></> : <p>{t('noProject')}</p>}</> : <p className="ent-empty">{t('noRevision')}</p>}
      <SiteHostingPanel key={site.id} siteId={site.id} revisionId={selectedRevision} t={t} />
    </>}
    <form className="site-prompt" onSubmit={event => { event.preventDefault(); void start() }}><label htmlFor="site-prompt">{t(site ? 'editPrompt' : 'prompt')}</label><textarea id="site-prompt" value={prompt} placeholder={t('placeholder')} onChange={event => setPrompt(event.target.value)} /><Button type="submit" variant="primary" disabled={busy || !prompt.trim()}>{t(busy ? 'creating' : site ? 'edit' : 'create')}</Button></form>
    </main></div>
  </div></section>
}

/** Responsive Sites panel styles scoped to the contributed management surface. */
export const siteStyle = `
.site-domains{margin-top:24px}.site-dns{margin-top:16px;overflow:auto}.site-dns table{width:100%;border-collapse:collapse;margin-top:12px;text-align:left}.site-dns th,.site-dns td{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l4);vertical-align:top}.site-dns code{overflow-wrap:anywhere}.site-domains input{min-width:0;max-width:100%}
.site-hosting{margin-top:24px;border-top:1px solid var(--dsw-alias-border-l4);padding-top:12px}.site-deployments{display:flex;flex-direction:column;gap:12px}.site-deployments article,.site-publish-review{padding:16px;border:1px solid var(--dsw-alias-border-l4);border-radius:10px}.site-deployments article>div:first-child{display:flex;gap:16px;flex-wrap:wrap}.site-hosting code{overflow-wrap:anywhere}.site-publish-review{margin-top:16px;background:var(--dsw-alias-bg-layer-2)}.site-hosting a{color:var(--dsw-alias-label-primary)}
.site-shell{max-width:1440px;margin:auto}.site-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px}.site-list{display:flex;flex-direction:column;gap:12px}.site-card{display:flex;flex-direction:column;gap:8px;text-align:left;padding:18px;border:1px solid var(--dsw-alias-border-l4);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:inherit;cursor:pointer}.site-card[aria-pressed=true]{border-color:#63946f;background:color-mix(in srgb,#63946f 10%,transparent)}.site-card-icon{font-size:26px;color:#63946f}.site-main{min-width:0}.site-welcome{text-align:center;padding:70px 30px 35px}.site-welcome h2{font-size:30px;letter-spacing:-1px}.site-welcome p{max-width:540px;margin:20px auto;line-height:1.8}.site-orb{display:inline-grid;place-items:center;width:74px;height:74px;border-radius:22px;background:#e7efe6;color:#3e674a;font-size:48px}.site-prompt{display:flex;flex-direction:column;align-items:flex-end;gap:14px;border:1px solid var(--dsw-alias-border-l4);padding:22px;border-radius:16px;margin:24px 0}.site-prompt label{align-self:flex-start}.site-prompt textarea{width:100%;box-sizing:border-box;min-height:95px;border:0;background:transparent;color:inherit;resize:vertical;font:inherit;outline:none}.site-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:14px;margin:16px 0}.site-toolbar h2{margin-right:auto}.site-toolbar select{max-width:100%;padding:8px;background:var(--dsw-alias-bg-layer-1);color:inherit;border:1px solid var(--dsw-alias-border-l4);border-radius:6px}.site-preview{display:flex;justify-content:center;overflow:hidden;border:1px solid var(--dsw-alias-border-l4);border-radius:12px;background:#e8ece7;padding:12px}.site-preview iframe{height:620px;border:0;background:white;border-radius:6px}.site-code{width:100%;min-height:450px;box-sizing:border-box;padding:18px;background:#17221d;color:#e4eee7;border:0;border-radius:12px;font:13px/1.7 ui-monospace,monospace;tab-size:2;resize:vertical}@media(max-width:800px){.site-layout{grid-template-columns:minmax(0,1fr)}.site-list{flex-direction:row;overflow-x:auto}.site-card{min-width:160px}.site-welcome{padding:30px 10px}.site-welcome h2{font-size:24px}.site-preview iframe{height:480px}.site-toolbar label{max-width:100%}}
`
