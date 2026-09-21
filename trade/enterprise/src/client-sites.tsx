/** Sites management reads persisted revisions; browser state never stands in for saved source. */
import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { Button, Input, IconPlusOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SiteLocaleKey } from './site-locales.ts'
import { SiteCompanyPanel } from './client-site-company.tsx'
import { SiteOperationsPanel } from './client-site-operations.tsx'
import { SiteLocalPanel } from './client-site-local.tsx'
import { SiteExperience } from './site-motion.tsx'
import { siteMotionStyle } from './site-motion-style.ts'
import { SiteHostingPanel } from './client-site-hosting.tsx'
import { importSiteFiles, siteRevisionBody, siteSourceZip } from './client-site-files.ts'
import type { SiteProject } from '../../../packages/site/site/src/types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sites: SiteLocaleKey }
}

const siteSchema = z.object({ id: z.string(), name: z.string(), currentRevisionId: z.string().optional(), liveRevisionId: z.string().optional(), availability: z.enum(['unknown', 'online', 'offline']).optional() })
const versionSchema = z.object({ id: z.string(), createdAt: z.string(), source: z.enum(['user', 'agent', 'rollback']) })
const projectSchema = z.object({ framework: z.enum(['static', 'nextjs']), files: z.array(z.object({ path: z.string(), content: z.string(), encoding: z.enum(['utf8', 'base64']) })) })
type Site = z.infer<typeof siteSchema>
type Version = z.infer<typeof versionSchema>
type Project = SiteProject
type Props = PropsLocale<'sites'> & { generate: (prompt: string, newSession?: boolean) => Promise<boolean> }
const errorKeys = ['error', 'conflict', 'tooLarge', 'duplicateFile', 'invalidProject'] as const

function SitePreview({ siteId, revisionId, title, mobile }: { siteId: string; revisionId: string; title: string; mobile: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [path, setPath] = useState('/')
  useEffect(() => {
    const navigate = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow) return
      const message = z.object({ type: z.literal('dsh-site-preview-navigation'), path: z.string().startsWith('/') }).strict().safeParse(event.data)
      if (message.success) setPath(message.data.path)
    }
    window.addEventListener('message', navigate)
    return () => window.removeEventListener('message', navigate)
  }, [])
  const fragment = path.indexOf('#')
  const query = new URLSearchParams({ siteId, revisionId, action: 'preview', path: fragment < 0 ? path : path.slice(0, fragment) })
  return <iframe ref={frame} title={title} sandbox="allow-scripts" style={{ width: mobile ? 'min(390px, 100%)' : '100%' }} src={`/api/enterprise/sites?${query}${fragment < 0 ? '' : path.slice(fragment)}`} />
}

async function request(query: Record<string, string>, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/enterprise/sites?${new URLSearchParams(query)}`, {
    signal, credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : response.status === 413 ? 'tooLarge' : response.status === 400 || response.status === 422 ? 'invalidProject' : 'error')
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
  const [savedProject, setSavedProject] = useState<Project>()
  const [maxBodyBytes, setMaxBodyBytes] = useState<number>()
  const [template, setTemplate] = useState<{ id: string; version: string }>()
  const [templateStyle, setTemplateStyle] = useState('industrial')
  const [brandName, setBrandName] = useState('')
  const [assetDirectory, setAssetDirectory] = useState('assets')
  const [replaceFiles, setReplaceFiles] = useState(false)
  const [filePath, setFilePath] = useState('index.html')
  const [newPath, setNewPath] = useState('')
  const [prompt, setPrompt] = useState('')
  const [tab, setTab] = useState<'preview' | 'code'>('preview')
  const [section, setSection] = useState<'website' | 'publication' | 'inquiries' | 'statistics'>('website')
  const sectionId = useId()
  const [mobile, setMobile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<(typeof errorKeys)[number]>()
  const [refresh, setRefresh] = useState(0)
  const lifetime = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void request({ action: 'templates' }, controller.signal).then(value => {
      const catalog = z.object({ items: z.array(z.object({ id: z.string(), version: z.string() })) }).parse(value)
      setTemplate(catalog.items.find(item => item.id === 'manufacturing'))
    }).catch(() => { if (!controller.signal.aborted) setError('error') })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void request({}, controller.signal).then(value => {
      const result = z.object({ items: z.array(siteSchema), maxBodyBytes: z.number().int().positive() }).parse(value)
      setSites(result.items)
      setMaxBodyBytes(result.maxBodyBytes)
      setError(undefined)
    }).catch(() => { if (!controller.signal.aborted) setError('error') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])
  const site = sites.find(item => item.id === selected)
  const selectedRevision = revision ?? site?.currentRevisionId
  const dirty = Boolean(project && project !== savedProject)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
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
      setSavedProject(content.project)
      setFilePath(content.project?.files[0]?.path ?? 'index.html')
    }).catch(() => { if (!controller.signal.aborted) setError('error') })
    return () => controller.abort()
  }, [selected, selectedRevision, refresh])
  const action = async (run: () => Promise<void>): Promise<void> => {
    const signal = lifetime.current.signal
    if (busy || signal.aborted) return
    setBusy(true); setError(undefined)
    try { await run() }
    catch (cause) { if (!signal.aborted) setError(errorKeys.find(key => cause instanceof Error && cause.message === key) ?? 'error') }
    finally { if (!signal.aborted) setBusy(false) }
  }
  const start = () => action(async () => {
    const message = selected ? t('changePrompt', { id: selected, prompt }) : t('createPrompt', { prompt })
    if (!await generate(message, true)) throw new Error('error')
  })
  const save = () => action(async () => {
    if (!site || !project) return
    const result = versionSchema.parse(await request({ siteId: site.id, action: 'revisions' }, lifetime.current.signal, siteRevisionBody(project, site.currentRevisionId)))
    setSavedProject(project)
    setRevision(result.id); setRefresh(value => value + 1)
  })
  const useStarter = () => action(async () => {
    if (!template) throw new Error('error')
    const result = siteSchema.parse(await request({ action: 'starter' }, lifetime.current.signal, { name: brandName.trim() || t('starterName'), template: { ...template, parameters: { style: templateStyle, ...(brandName.trim() ? { brandName: brandName.trim() } : {}) } } }))
    setSites(items => [...items, result]); setSelected(result.id); setRevision(result.currentRevisionId)
    setTab('preview'); setSection('website'); setPrompt(''); setRefresh(value => value + 1)
  })
  const restore = () => action(async () => {
    if (!site || !selectedRevision) return
    const result = versionSchema.parse(await request({ siteId: site.id, action: 'rollback' }, lifetime.current.signal, { revisionId: selectedRevision, expectedRevisionId: site.currentRevisionId }))
    setRevision(result.id); setRefresh(value => value + 1)
  })
  const activeFile = project?.files.find(file => file.path === filePath)
  const upload = (files: readonly File[]) => action(async () => {
    if (!project || !maxBodyBytes || !files.length) return
    const next = await importSiteFiles(project, files, { directory: assetDirectory, replace: replaceFiles, baseRevisionId: site?.currentRevisionId, maxBodyBytes }, lifetime.current.signal)
    setProject(next)
  })
  const exportSource = () => {
    if (!project) return
    const url = URL.createObjectURL(new Blob([siteSourceZip(project)], { type: 'application/zip' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `${site?.id ?? 'site'}.zip`; anchor.click()
    URL.revokeObjectURL(url)
  }
  const promptForm = <form className="site-prompt" aria-busy={busy} data-ready={!busy && !dirty && Boolean(prompt.trim())} onSubmit={event => { event.preventDefault(); void start() }}><div className="site-prompt-heading"><label htmlFor="site-prompt">{t(site ? 'editPrompt' : 'prompt')}</label>{!site && <p>{t('promptDetail')}</p>}</div><textarea id="site-prompt" value={prompt} placeholder={t('placeholder')} onChange={event => setPrompt(event.target.value)} /><div className="site-prompt-footer"><Button type="submit" variant="primary" className="site-prompt-submit" aria-busy={busy} disabled={busy || dirty || !prompt.trim()}>{t(busy ? 'creating' : site ? 'edit' : 'create')}<span className="site-submit-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 10h12m-5-5 5 5-5 5" /></svg></span></Button></div></form>
  return <section className="ent site-workspace"><div className="site-shell">
    <header className="ent-header"><div><h1>{t('title')}</h1><p className="ent-muted">{t('subtitle')}</p></div><div className="ent-actions"><Button disabled={busy || dirty} onClick={() => setRefresh(value => value + 1)}>{t('refresh')}</Button><Button variant="primary" disabled={busy || dirty} icon={<IconPlusOutline16 />} onClick={() => { setSelected(undefined); setRevision(undefined); setPrompt('') }}>{t('newWebsite')}</Button></div></header>
    {error && <p role="alert" className="ent-notice">{t(error)}</p>}
    <dl className="site-overview" aria-label={t('websiteList')}><div><dt>{t('websiteTotal')}</dt><dd>{loading || maxBodyBytes === undefined ? '—' : sites.length}</dd></div><div><dt>{t('websiteDrafts')}</dt><dd>{loading || maxBodyBytes === undefined ? '—' : sites.filter(item => !item.liveRevisionId).length}</dd></div><div><dt>{t('websiteOnline')}</dt><dd>{loading || maxBodyBytes === undefined ? '—' : sites.filter(item => item.availability === 'online').length}</dd></div></dl>
    <div className="site-layout" data-empty={sites.length === 0}><aside className="site-list" aria-label={t('websiteList')}><div className="site-list-heading"><h2>{t('websiteList')}</h2><span>{sites.length}</span></div>{loading && <p role="status">{t('loading')}</p>}{sites.map(item => <button className="site-card" disabled={busy || dirty} key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setRevision(undefined); setPrompt(''); setError(undefined); setSection('website') }}><span className="site-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 6.5h1M10 6.5h1" /></svg></span><span className="site-card-content"><strong>{item.name}</strong><span className="site-status" data-status={item.availability ?? (item.liveRevisionId ? 'published' : 'draft')}>{t(item.availability ?? (item.liveRevisionId ? 'published' : 'draft'))}</span></span></button>)}</aside>
    <main className="site-main">{!site ? <div className="site-welcome"><SiteExperience t={t} /><div className="site-template-options"><label>{t('templateStyle')}<select disabled={busy} value={templateStyle} onChange={event => setTemplateStyle(event.target.value)}>{(['industrial', 'precision', 'international'] as const).map(style => <option key={style} value={style}>{t(style)}</option>)}</select></label></div><div className="site-creation-primary"><SiteCompanyPanel t={t} style={templateStyle} created={result => { setSites(items => [...items, result]); setSelected(result.id); setRevision(result.currentRevisionId); setTab('preview'); setSection('website'); setPrompt(''); setRefresh(value => value + 1) }} /></div><details className="site-secondary-options"><summary>{t('creationOptions')}</summary>{promptForm}<article className="site-starter"><h3>{t('starterTitle')}</h3><p>{t('starterDetail')}</p><div className="site-template-options"><label>{t('templateBrand')}<Input disabled={busy} maxLength={80} value={brandName} placeholder={t('templateBrandHint')} onChange={event => setBrandName(event.target.value)} /></label></div><Button disabled={busy || loading || !template} onClick={() => { void useStarter() }}>{t('useStarter')}</Button></article></details></div> : <>
      <div className="site-toolbar site-editor-heading"><div><h2>{site.name}</h2><span className="site-status" data-status={site.availability ?? (site.liveRevisionId ? 'published' : 'draft')}>{t(site.availability ?? (site.liveRevisionId ? 'published' : 'draft'))}</span></div></div>
      <div className="site-sections" role="tablist" aria-label={t('workspaceNavigation')}>
        {(['website', 'publication', 'inquiries', 'statistics'] as const).map((value, index, values) => <button key={value} id={sectionId + '-' + value} type="button" role="tab" aria-selected={section === value} aria-controls={sectionId + '-panel-' + value} tabIndex={section === value ? 0 : -1} onClick={() => setSection(value)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % values.length : event.key === 'ArrowLeft' ? (index + values.length - 1) % values.length : event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : undefined; if (next === undefined) return; event.preventDefault(); setSection(values[next]!); document.getElementById(sectionId + '-' + values[next])?.focus() }}>{t(value === 'website' ? 'workspaceWebsite' : value === 'publication' ? 'workspacePublication' : value === 'inquiries' ? 'workspaceInquiries' : 'workspaceStatistics')}</button>)}
      </div>
      <div role="tabpanel" id={sectionId + '-panel-website'} aria-labelledby={sectionId + '-website'} hidden={section !== 'website'}>
      {dirty && <div className="ent-notice"><p role="status">{t('unsaved')}</p><Button disabled={busy} onClick={() => { setProject(savedProject); setError(undefined) }}>{t('discard')}</Button></div>}
      {selectedRevision ? <><div className="site-toolbar"><nav className="ent-tabs">{(['preview', 'code'] as const).map(value => <button className="ent-tab" aria-pressed={tab === value} key={value} onClick={() => setTab(value)}>{t(value)}</button>)}</nav><label>{t('history')} <select disabled={busy || dirty} aria-label={t('history')} value={selectedRevision} onChange={event => setRevision(event.target.value)}>{versions.map(version => <option key={version.id} value={version.id}>{new Date(version.createdAt).toLocaleString()} · {t(version.source)}</option>)}</select></label><Button disabled={busy || dirty || selectedRevision === site.currentRevisionId} onClick={() => { void restore() }}>{t('restore')}</Button></div>
      <div className="site-editor-panel" key={tab}>{tab === 'preview' ? <><div className="site-toolbar site-preview-toolbar"><span>{t('previewSaved')}</span><div><Button onClick={() => setMobile(false)} aria-pressed={!mobile}>{t('desktop')}</Button><Button onClick={() => setMobile(true)} aria-pressed={mobile}>{t('mobile')}</Button></div></div>{project?.framework === 'nextjs' ? <p>{t('buildNext')}</p> : project ? <div className="site-preview" data-mobile={mobile}><SitePreview key={`${site.id}:${selectedRevision}`} siteId={site.id} revisionId={selectedRevision} title={t('preview')} mobile={mobile} /></div> : <p className="ent-empty">{t('noProject')}</p>}</>
      : project ? <><div className="site-toolbar"><select disabled={busy} aria-label={t('files')} value={filePath} onChange={event => setFilePath(event.target.value)}>{project.files.map(file => <option value={file.path} key={file.path}>{file.path}</option>)}</select><Button disabled={busy} onClick={exportSource}>{t('export')}</Button><Button variant="primary" className="site-save" aria-busy={busy} disabled={busy || !dirty} onClick={() => { void save() }}>{t(busy ? 'saving' : 'save')}</Button></div>{activeFile?.encoding === 'utf8' ? <textarea disabled={busy} className="site-code" spellCheck={false} aria-label={t('code')} value={activeFile.content} onChange={event => setProject({ ...project, files: project.files.map(file => file.path === filePath ? { ...file, content: event.target.value } : file) })} /> : <p>{t(activeFile ? 'binary' : 'noFiles')}</p>}<div className="site-toolbar"><Input disabled={busy} aria-label={t('fileName')} placeholder={t('fileName')} value={newPath} onChange={event => setNewPath(event.target.value)} /><Button disabled={busy || !newPath.trim() || project.files.some(file => file.path === newPath.trim())} onClick={() => { const path = newPath.trim(); setProject({ ...project, files: [...project.files, { path, content: '', encoding: 'utf8' }] }); setFilePath(path); setNewPath('') }}>{t('addFile')}</Button><Button disabled={busy || !activeFile} onClick={() => setProject({ ...project, files: project.files.filter(file => file.path !== filePath) })}>{t('removeFile')}</Button></div><fieldset className="site-assets" disabled={busy || !maxBodyBytes}><legend>{t('uploadFiles')}</legend><p className="ent-muted">{t('uploadDetail')}</p><div className="site-toolbar"><Input aria-label={t('assetDirectory')} value={assetDirectory} onChange={event => setAssetDirectory(event.target.value)} /><label><input type="checkbox" checked={replaceFiles} onChange={event => setReplaceFiles(event.target.checked)} /> {t('replaceFiles')}</label><input type="file" multiple aria-label={t('selectFiles')} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files) }} /></div></fieldset></> : <p>{t('noProject')}</p>}</div></> : <p className="ent-empty">{t('noRevision')}</p>}
      <details className="site-secondary-options"><summary>{t('editPrompt')}</summary>{promptForm}</details>
      <SiteOperationsPanel mode="content" key={`ops:${site.id}:${selectedRevision}`} siteId={site.id} t={t} disabled={busy || dirty} saved={id => { setRevision(id); setRefresh(value => value + 1) }} />
      </div>
      <div role="tabpanel" id={sectionId + '-panel-publication'} aria-labelledby={sectionId + '-publication'} hidden={section !== 'publication'}>
        <SiteLocalPanel mode="publication" key={'publish:' + site.id + ':' + selectedRevision} siteId={site.id} revisionId={selectedRevision} t={t} disabled={busy || dirty} active={section === 'publication'} publicationChanged={() => setRefresh(value => value + 1)} />
        <details className="site-secondary-options"><summary>{t('hostingTitle')}</summary><SiteHostingPanel key={site.id} siteId={site.id} revisionId={selectedRevision} t={t} /></details>
      </div>
      <div role="tabpanel" id={sectionId + '-panel-inquiries'} aria-labelledby={sectionId + '-inquiries'} hidden={section !== 'inquiries'}>
        <SiteLocalPanel mode="inquiries" key={'inbox:' + site.id} siteId={site.id} t={t} disabled={busy} active={section === 'inquiries'} publicationChanged={() => setRefresh(value => value + 1)} />
      </div>
      <div role="tabpanel" id={sectionId + '-panel-statistics'} aria-labelledby={sectionId + '-statistics'} hidden={section !== 'statistics'}>
        <SiteOperationsPanel mode="traffic" key={'traffic:' + site.id + ':' + selectedRevision} siteId={site.id} t={t} disabled={busy || dirty} saved={id => { setRevision(id); setRefresh(value => value + 1) }} />
      </div>
    </>}
    </main></div>
  </div></section>
}

/** Responsive Sites management, source editing and publication controls. */
export const siteStyle = `
${siteMotionStyle}
.site-workspace [hidden]{display:none!important}.site-sections{display:flex;gap:4px;padding:4px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);margin:0 0 22px;max-width:520px}.site-sections button{flex:1;padding:10px 14px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .16s,color .16s,box-shadow .16s}.site-sections button[aria-selected=true]{color:var(--site-accent);background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 4px #0000000a}.site-sections button:focus-visible,.site-secondary-options>summary:focus-visible{outline:2px solid var(--site-accent);outline-offset:2px}.site-secondary-options{margin:20px 0;border-top:1px solid var(--dsw-alias-border-l4)}.site-secondary-options>summary{padding:16px 2px;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:13px;font-weight:600}.site-creation-primary .site-starter{padding:28px}.site-welcome>.site-template-options{max-width:320px}.site-panel-body{border:0;padding:0;margin:0;min-width:0}.site-panel-body>h3{font-size:16px;margin:0 0 10px}.site-panel-body>p{font-size:13px;line-height:1.8;color:var(--dsw-alias-label-tertiary)}.site-local{margin-top:0}.site-launch-checks{display:grid;gap:0;margin:20px 0}.site-launch-checks>div{display:flex;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l4);font-size:13px;line-height:1.7}.site-launch-checks dt{flex-shrink:0;color:var(--dsw-alias-label-tertiary)}.site-launch-checks dd{margin:0;text-align:right;overflow-wrap:anywhere;min-width:0}.site-launch-links{font-size:12px;line-height:1.8;margin-top:24px}.site-empty-state{padding:44px 24px;text-align:center;border:1px dashed var(--dsw-alias-border-l4);border-radius:10px;margin:24px 0}.site-empty-state strong{font-size:15px}.site-empty-state p{font-size:13px;line-height:1.8;color:var(--dsw-alias-label-tertiary)}.site-inbox-filters{margin:22px 0;font-size:12px}.site-local input:not([type=checkbox]),.site-local select{padding:9px 12px;margin:8px 0;display:block;border:1px solid var(--dsw-alias-border-l4);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit}.site-local .ent-actions>label{font-size:12px}.site-operations h4{font-size:13px}.site-metric-tables{overflow-x:auto}.site-metric-tables table{min-width:210px;font-size:12px}.site-metric-tables caption{text-align:left;font-weight:600;padding:12px 8px}.site-metrics{font-variant-numeric:tabular-nums}.site-metrics dt{font-size:12px;color:var(--dsw-alias-label-tertiary)}
@media(max-width:640px){.site-sections{width:100%;box-sizing:border-box}.site-sections button{padding:10px 5px}.site-launch-checks>div{flex-direction:column;gap:5px}.site-launch-checks dd{text-align:left}.site-creation-primary .site-starter{padding:20px}.site-local .ent-actions{gap:8px}.site-metrics>div{flex:1;min-width:90px}.site-panel-body .site-deployments article>div{flex-wrap:wrap}.site-panel-body p{overflow-wrap:anywhere}}
@media(prefers-reduced-motion:reduce){.site-sections button{transition:none}}
.site-workspace{--site-accent:var(--workbench-action,#3655db);font-family:var(--workbench-font,Inter,"Segoe UI","Microsoft YaHei",sans-serif)}.site-shell{max-width:1440px;margin:auto}.site-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0 0 24px}.site-overview>div{padding:18px 20px;border:1px solid var(--dsw-alias-border-l4);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}.site-overview dt{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:9px}.site-overview dd{font-size:26px;line-height:1.15;font-weight:650;letter-spacing:-.7px;font-variant-numeric:tabular-nums;margin:0}
.site-layout{display:grid;grid-template-columns:224px minmax(0,1fr);gap:24px;align-items:start}.site-layout[data-empty=true]{grid-template-columns:minmax(0,1fr)}.site-layout[data-empty=true]>.site-list{display:none}.site-list{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l4);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:10px}.site-list-heading{display:flex;justify-content:space-between;align-items:center;padding:8px 8px 14px;gap:8px}.site-list-heading h2{font-size:12px;font-weight:600;margin:0}.site-list-heading>span{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.site-card{display:flex;align-items:center;gap:10px;text-align:left;padding:12px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;cursor:pointer;font:inherit;min-width:0}.site-card:hover{background:var(--dsw-alias-bg-layer-2)}.site-card[aria-pressed=true]{border-color:color-mix(in srgb,var(--site-accent) 20%,transparent);background:color-mix(in srgb,var(--site-accent) 7%,transparent)}.site-card:focus-visible{outline:2px solid var(--site-accent);outline-offset:2px}.site-card:disabled{cursor:default;opacity:.6}.site-card-icon{display:grid;place-items:center;flex:0 0 32px;height:36px;border-radius:7px;color:var(--dsw-alias-label-tertiary)}.site-card[aria-pressed=true] .site-card-icon{color:var(--site-accent)}.site-card-icon svg{height:23px;width:23px}.site-card-content{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}.site-card strong{font-size:13px;line-height:1.5;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.site-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;line-height:1.4;color:var(--dsw-alias-label-tertiary)}.site-status:before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}.site-status[data-status=online],.site-status[data-status=published]{color:#228164}.site-status[data-status=unknown]{color:#ad782e}.site-main{min-width:0}.site-welcome{text-align:left;padding:0}.site-creation-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}.site-welcome .site-creation-heading{font-size:13px;font-weight:600;letter-spacing:0;margin:26px 0 13px}.site-starter{margin:0;padding:22px;min-width:0;border:1px solid var(--dsw-alias-border-l4);border-radius:12px;background:var(--dsw-alias-bg-layer-1);text-align:left}.site-starter h3{font-size:15px;font-weight:650;margin:0;letter-spacing:-.2px}.site-starter>p{margin:10px 0 20px;font-size:12px;line-height:1.8;color:var(--dsw-alias-label-tertiary)}.site-template-options{display:flex;flex-wrap:wrap;gap:14px;margin:18px 0}.site-template-options label{display:flex;flex:1;min-width:140px;flex-direction:column;gap:8px;font-size:12px}.site-template-options select{padding:9px 10px;border:1px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:7px;font:inherit}
.site-company-review{overflow-wrap:anywhere;padding-top:12px;margin-top:16px;border-top:1px solid var(--dsw-alias-border-l4)}.site-company-review p{max-width:none;font-size:12px;line-height:1.8}.site-company-review details{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l4);font-size:12px}.site-company-review summary{cursor:pointer}.site-company-review>label{display:block;font-size:12px;line-height:1.8;margin-top:18px}.site-inquiry-message{white-space:pre-wrap;overflow-wrap:anywhere}
.site-prompt{display:flex;flex-direction:column;gap:14px;border:1px solid var(--dsw-alias-border-l4);padding:22px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);margin:20px 0}.site-prompt:focus-within{border-color:color-mix(in srgb,var(--site-accent) 55%,var(--dsw-alias-border-l4));box-shadow:0 0 0 3px color-mix(in srgb,var(--site-accent) 6%,transparent)}.site-prompt-heading label{font-size:14px;font-weight:600}.site-prompt-heading p{font-size:12px;line-height:1.7;margin:7px 0 0;color:var(--dsw-alias-label-tertiary)}.site-prompt textarea{display:block;width:100%;box-sizing:border-box;min-height:88px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;resize:vertical;font:inherit;font-size:13px;line-height:1.7;outline:none}.site-prompt textarea::placeholder{color:var(--dsw-alias-label-tertiary)}.site-prompt-footer{display:flex;justify-content:flex-end}.site-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:16px 0}.site-toolbar h2{margin:0;font-size:19px;font-weight:650;letter-spacing:-.4px}.site-editor-heading{margin:0 0 20px;padding:2px 0 18px;border-bottom:1px solid var(--dsw-alias-border-l4)}.site-editor-heading>div{display:flex;align-items:center;flex-wrap:wrap;gap:14px}.site-toolbar label{font-size:12px;color:var(--dsw-alias-label-tertiary)}.site-toolbar select{max-width:100%;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l4);border-radius:7px;font:inherit;font-size:12px}.site-preview-toolbar{justify-content:space-between;margin:20px 0 10px}.site-preview-toolbar>span{color:var(--dsw-alias-label-tertiary);font-size:12px}.site-preview-toolbar>div{display:flex;gap:5px}.site-preview-toolbar button[aria-pressed=true]{background:color-mix(in srgb,var(--site-accent) 8%,transparent);color:var(--site-accent)}.site-preview{display:flex;justify-content:center;overflow:hidden;border:1px solid var(--dsw-alias-border-l4);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:10px}.site-preview iframe{height:600px;border:0;background:white;border-radius:5px;box-shadow:0 2px 8px #0000000a}.site-preview[data-mobile=true]{padding:18px}.site-code{width:100%;min-height:450px;box-sizing:border-box;padding:18px;background:#172130;color:#dce6f3;border:1px solid #263346;border-radius:10px;font:13px/1.7 ui-monospace,monospace;tab-size:2;resize:vertical}
.site-operations fieldset{margin:18px 0;padding:16px;border:1px solid var(--dsw-alias-border-l4);border-radius:8px}.site-operations label{display:block;font-size:12px;line-height:1.8;margin:12px 0}.site-operations textarea,.site-operations input:not([type=checkbox]),.site-operations select{display:block;box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:inherit}.site-operations textarea{resize:vertical}.site-operations summary{cursor:pointer;padding:12px 0;font-weight:600}.site-metrics,.site-metric-tables{display:flex;gap:20px;flex-wrap:wrap}.site-metrics>div{padding:16px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;min-width:100px}.site-metrics dd{margin:6px 0;font-size:24px}.site-metric-tables table{flex:1;text-align:left;border-collapse:collapse}.site-metric-tables td,.site-metric-tables th{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l4)}.site-assets{margin-top:20px;border:1px solid var(--dsw-alias-border-l4);border-radius:10px;padding:16px;background:var(--dsw-alias-bg-layer-1)}.site-assets legend{font-size:12px;font-weight:600;padding:0 7px}.site-assets p{font-size:12px;line-height:1.7}.site-assets input[type=file]{max-width:100%;font-size:12px}.site-assets label{display:flex;align-items:center;gap:6px}.site-build-log{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;padding:12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font:12px/1.6 ui-monospace,monospace}.site-hosting{margin-top:24px;border:1px solid var(--dsw-alias-border-l4);border-radius:12px;padding:22px;background:var(--dsw-alias-bg-layer-1)}.site-hosting>h3{margin:0 0 8px;font-size:15px;font-weight:650}.site-hosting>p{font-size:12px;line-height:1.8}.site-hosting code{overflow-wrap:anywhere;font-size:12px}.site-hosting a{color:var(--site-accent)}.site-deployments{display:flex;flex-direction:column;gap:12px}.site-deployments article,.site-publish-review{padding:16px;border:1px solid var(--dsw-alias-border-l4);border-radius:9px}.site-deployments article>div:first-child{display:flex;gap:16px;flex-wrap:wrap}.site-publish-review{margin-top:16px;background:var(--dsw-alias-bg-layer-2)}.site-publish-review label{font-size:12px;line-height:1.8}.site-domains{margin-top:24px}.site-domains>h4{font-size:13px}.site-domains input{min-width:0;max-width:100%}.site-dns{margin-top:16px;overflow:auto}.site-dns table{width:100%;border-collapse:collapse;margin-top:12px;text-align:left;font-size:12px}.site-dns th,.site-dns td{padding:10px;border-bottom:1px solid var(--dsw-alias-border-l4);vertical-align:top}.site-dns code{overflow-wrap:anywhere}
.site-card{position:relative;transition:background 150ms ease,border-color 150ms ease,box-shadow 150ms ease,transform 150ms ease}.site-card:before{content:'';position:absolute;top:13px;bottom:13px;left:0;width:3px;border-radius:0 3px 3px 0;background:var(--site-accent);transform:scaleY(0);opacity:0;transition:transform 160ms ease,opacity 160ms ease}.site-card[aria-pressed=true]:before{transform:scaleY(1);opacity:1}.site-card-icon{transition:color 150ms ease,transform 150ms ease}.site-card:not(:disabled):active{transform:scale(.985)}
.site-prompt{transition:border-color 180ms ease,box-shadow 180ms ease}.site-prompt textarea{transition:background 180ms ease,box-shadow 180ms ease}.site-prompt textarea:focus-visible{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--site-accent) 30%,transparent)}.site-prompt[data-ready=true] .site-prompt-submit{box-shadow:0 3px 9px color-mix(in srgb,var(--site-accent) 20%,transparent)}.site-prompt-footer .site-prompt-submit{display:inline-flex;align-items:center;gap:8px;min-width:116px;transition:background 150ms ease,color 150ms ease,box-shadow 150ms ease,transform 150ms ease}.site-submit-arrow{display:inline-flex;width:16px;height:16px;transition:transform 150ms ease,opacity 150ms ease}.site-prompt-submit:disabled .site-submit-arrow{opacity:.45}.site-prompt-submit[aria-busy=true] .site-submit-arrow{display:none}.site-prompt-submit[aria-busy=true]:after,.site-save[aria-busy=true]:after{content:'';display:inline-block;width:13px;height:13px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:site-working 750ms linear infinite}.site-prompt-submit[aria-busy=true],.site-save[aria-busy=true]{cursor:progress}.site-save[aria-busy=true]{display:inline-flex;align-items:center;gap:8px}
.site-toolbar>.ent-tabs{gap:3px;margin:0;padding:3px;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}.site-toolbar>.ent-tabs>.ent-tab{padding:7px 14px;border:0;border-radius:5px;font-size:12px;transition:background-color 150ms ease,color 150ms ease,box-shadow 150ms ease}.site-toolbar>.ent-tabs>.ent-tab[aria-pressed=true]{color:var(--site-accent);background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 3px color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.site-editor-panel{animation:site-panel-enter 170ms ease-out both}.site-preview{transition:padding 220ms ease,background 180ms ease}.site-preview iframe{transition:width 240ms cubic-bezier(.2,.7,.2,1),border-radius 220ms ease}.site-preview[data-mobile=true] iframe{border-radius:12px}.site-preview-toolbar button{transition:background 150ms ease,color 150ms ease,box-shadow 150ms ease}.site-preview-toolbar button[aria-pressed=true]{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--site-accent) 18%,transparent)}.site-code{transition:box-shadow 160ms ease}.site-code:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--site-accent) 22%,transparent)}.site-template-options select{transition:border-color 150ms ease,box-shadow 150ms ease}.site-template-options select:focus-visible{outline:none;border-color:var(--site-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--site-accent) 10%,transparent)}
@media(hover:hover){.site-card:not(:disabled):hover{box-shadow:0 3px 10px #00000006}.site-card:not(:disabled):hover .site-card-icon{color:var(--site-accent);transform:translateY(-1px)}.site-prompt-submit:not(:disabled):hover .site-submit-arrow{transform:translateX(3px)}}.site-prompt-submit:not(:disabled):focus-visible .site-submit-arrow{transform:translateX(3px)}
@keyframes site-panel-enter{from{opacity:.65;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@keyframes site-working{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.site-card,.site-card:before,.site-card-icon,.site-prompt,.site-prompt textarea,.site-prompt-footer .site-prompt-submit,.site-submit-arrow,.site-preview,.site-preview iframe,.site-preview-toolbar button,.site-code,.site-template-options select,.site-toolbar>.ent-tabs>.ent-tab{transition:none}.site-editor-panel,.site-prompt-submit[aria-busy=true]:after,.site-save[aria-busy=true]:after{animation:none}.site-card:not(:disabled):active,.site-card:not(:disabled):hover .site-card-icon,.site-prompt-submit:not(:disabled):active,.site-prompt-submit:not(:disabled):hover .site-submit-arrow{transform:none}}
@media(max-width:1050px){.site-layout{grid-template-columns:190px minmax(0,1fr);gap:18px}.site-creation-options{grid-template-columns:1fr}.site-overview{gap:12px}.site-overview>div{padding:16px}}
@media(max-width:800px){.site-layout{grid-template-columns:minmax(0,1fr)}.site-list{flex-direction:row;overflow-x:auto}.site-list-heading{display:none}.site-card{flex:0 0 180px}.site-overview{gap:8px;margin-bottom:20px}.site-overview>div{padding:14px 12px}.site-overview dt{font-size:11px}.site-overview dd{font-size:23px}.site-preview iframe{height:480px}.site-toolbar label{max-width:100%}.site-starter,.site-prompt,.site-hosting{padding:18px}.site-toolbar{gap:8px}.site-toolbar>input{min-width:0}.site-editor-heading>div{gap:9px}.site-toolbar h2{font-size:18px}.site-preview-toolbar>div{gap:3px}}
`
