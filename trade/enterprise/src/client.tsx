/** Enterprise panel contributed through native sidebar and main slots. */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ComputersPanel } from './client-computers.tsx'
import { CommerceEntry } from './client-commerce.tsx'
import { computerMotionStyle } from './computer-motion-style.ts'
import { computerZh, computerEn } from './computer-locales.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsHooks, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, Modal, IconFolderOpenOutline16, IconPlusOutline16, IconEditOutline16, IconTrashOutline16, IconDownloadOutline16, IconSearchOutline16, fileSizeText } from '@deepseek-ai/dsh-client-ui-primitives'
import { createModel } from './model.ts'
import { zh, en } from './locales.ts'
import type { EnterpriseKey } from './locales.ts'
import { profileSchema, filenameSchema } from './schema.ts'
import type { Asset, Profile } from './schema.ts'
import { style } from './style.ts'
import { workbenchStyle } from './workbench-style.ts'
import { EnterpriseOverview } from './client-overview.tsx'
import { TaskPanel } from './client-tasks.tsx'
import { OpportunityPanel } from './client-opportunities.tsx'
import { SitesPanel, siteStyle } from './client-sites.tsx'
import { siteZh, siteEn } from './site-locales.ts'
import { ProfileIcon, EnterpriseMark, SitesMark, ComputersMark } from './profile-icons.tsx'
import type { ProfileIconName } from './profile-icons.tsx'
import { SupplierPanel, supplierStyle } from './client-supplier.tsx'
import { OnboardingPanel, onboardingStyle } from './client-onboarding.tsx'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { enterprise: EnterpriseKey }
}

type Model = ReturnType<typeof createModel>
type Actions = Pick<Model, 'load' | 'save' | 'upload' | 'rename' | 'remove' | 'task' | 'opportunity'> & { generate: (prompt: string, newSession?: boolean) => Promise<boolean> }
type Props = PropsRuntime<'main'> & PropsLocale<'enterprise'> & Actions & PropsHooks<{ enterprise: Model['source']; sessions: ISessions['list'] }>
type T = PropsLocale<'enterprise'>['t']
const fields = ['name', 'description', 'business', 'website', 'contact', 'email', 'phone', 'address'] as const
const fileUrl = (asset: { id: string }, download = false): string => `/api/enterprise/file?id=${encodeURIComponent(asset.id)}${download ? '&download=1' : ''}`
const accept = '.png,.jpg,.jpeg,.webp,.gif,.avif,.mp4,.webm,.mov,.pdf,.docx,.xlsx,.pptx,.txt,.csv,.md,.zip'

/** Arrow keys keep tab selection and focus together; Tab exits the tab list. */
function navigateTabs(event: KeyboardEvent<HTMLButtonElement>): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const index = tabs.indexOf(event.currentTarget)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  tabs[next]!.focus()
  tabs[next]!.click()
}

function ProfileForm({ initial, t, busy, onSave, onCancel }: { initial: Profile; t: T; busy: boolean; onSave: (value: Profile) => Promise<boolean>; onCancel?: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [invalid, setInvalid] = useState(false)
  return <form className="ent-form" onSubmit={event => {
    event.preventDefault()
    const parsed = profileSchema.safeParse(draft)
    setInvalid(!parsed.success)
    if (parsed.success) void onSave(parsed.data)
  }}>
    {invalid && <p role="alert" className="ent-notice">{t('invalid')}</p>}
    <div className="ent-grid">
      <label className="ent-field"><span>{t('kind')}</span><select value={draft.kind} disabled={busy} onChange={event => setDraft({ ...draft, kind: event.target.value as Profile['kind'] })}><option value="enterprise">{t('enterprise')}</option><option value="studio">{t('studio')}</option></select></label>
      {fields.map(field => <label className={`ent-field ${['description', 'business', 'address'].includes(field) ? 'ent-wide' : ''}`} key={field}>
        <span>{t(field)}{field === 'name' ? ' *' : ''}</span>
        {field === 'description' || field === 'business'
          ? <textarea value={draft[field]} maxLength={field === 'description' ? 5000 : 3000} disabled={busy} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />
          : <Input value={draft[field]} required={field === 'name'} type={field === 'email' ? 'email' : field === 'website' ? 'url' : 'text'} maxLength={field === 'address' ? 1000 : field === 'website' ? 2000 : 160} disabled={busy} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />}
      </label>)}
    </div>
    <div className="ent-actions"><Button type="submit" variant="primary" aria-busy={busy} disabled={busy}>{t('saveSubmit')}</Button>{onCancel && <Button onClick={onCancel} disabled={busy}>{t('cancel')}</Button>}</div>
  </form>
}

function Panel({ t, useEnterprise, useSessions, load, save, upload, rename, remove, task, opportunity, generate }: Props) {
  const state = useEnterprise(value => value)
  const sessions = useSessions(value => value)
  const [tab, setTab] = useState<'profile' | 'assets' | 'ai' | 'tasks' | 'opportunities' | 'overview' | 'supplier'>('overview')
  const tabList = useRef<HTMLElement>(null)
  const selectTab = (value: typeof tab): void => {
    if (value === tab) return
    tabList.current?.querySelector<HTMLButtonElement>(`#enterprise-tab-${value}`)?.focus()
    setTab(value)
    setEditing(false)
    setSaved(false)
    if (value === 'overview' || value === 'ai') void load()
  }
  const [commerceActive, setCommerceActive] = useState(false)
  const [editing, setEditing] = useState(false)
  const [filter, setFilter] = useState<'all' | Asset['category']>('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<Asset | null>(null)
  const [renaming, setRenaming] = useState<Asset | null>(null)
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState<Asset | null>(null)
  const [logoPicker, setLogoPicker] = useState(false)
  const [saved, setSaved] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  useEffect(() => { void load() }, [load])
  const data = state.data
  const profile = data?.profile
  const assistant = <OnboardingPanel t={t} state={state} conversationStarted={Boolean(data?.onboarding.sessionId && sessions.byId[data.onboarding.sessionId]?.blank === false)} open={() => generate(`/product-geo ${t('onboardingPrompt')}`, true)} />
  const assets = data?.files ?? []
  const logo = assets.find(file => file.id === profile?.logoId)
  const visible = assets.filter(file => (filter === 'all' || file.category === filter) && file.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const knowledgeReady = assets.filter(file => file.knowledgeStatus === 'ready').length
  const saveProfile = async (value: Profile): Promise<boolean> => {
    const ok = await save(value)
    if (ok) { setEditing(false); setSaved(true) }
    return ok
  }
  const selectLogo = async (id: Profile['logoId']): Promise<void> => {
    if (profile && await save({ ...profile, logoId: id })) setLogoPicker(false)
  }
  const runGeneration = async (prompt: string, newSession = false): Promise<void> => {
    if (generating) return
    setGenerating(true)
    setGenerationError(false)
    try { if (!await generate(prompt, newSession)) setGenerationError(true) }
    finally { setGenerating(false) }
  }
  const knowledgeLabel = (asset: Asset): string => t(asset.knowledgeStatus === 'ready' ? 'knowledgeReady' : asset.knowledgeStatus === 'empty' ? 'knowledgeEmpty' : asset.knowledgeStatus === 'failed' ? 'knowledgeFailed' : 'knowledgeUnsupported')
  const download = (asset: Asset) => <a href={fileUrl(asset, true)} download={asset.name} title={t('download')} aria-label={t('download')}><IconDownloadOutline16 /></a>
  const uploadControl = <Button variant="primary" icon={<IconPlusOutline16 />} onClick={() => fileInput.current?.click()} disabled={state.busy}>{t('upload')}</Button>
  const facts = (keys: Array<keyof Pick<Profile, 'name' | 'description' | 'business' | 'website' | 'contact' | 'email' | 'phone' | 'address'>>) => keys.map(key => <div key={key} className={`ent-field ${key === 'description' || key === 'business' || key === 'address' ? 'ent-wide' : ''}`}><dt>{t(key)}</dt><dd>{profile?.[key] ? key === 'website' ? <a href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a> : profile[key] : t('notSet')}</dd></div>)
  return <section className={`ent ent-profile${commerceActive ? ' ent-commerce-active' : ''}`} aria-busy={state.busy}><div className="ent-inner">
    <header className="ent-header"><div className="ent-identity">{logo ? <img className="ent-logo" src={fileUrl(logo)} alt={t('logo')} /> : <div className="ent-logo ent-profile-mark" aria-hidden="true">{profile?.name.slice(0, 1) ?? <ProfileIcon name="company" size={27} />}</div>}<div><h1>{profile?.name ?? t('title')}</h1><p className="ent-muted">{profile ? t(profile.kind) : t('create')}</p></div></div>
      <div className="ent-actions">{state.busy && data && !state.progress && <span className="wb-sync" role="status" aria-label={t('loading')} />}{profile && <Button icon={<ProfileIcon name="sparkle" size={17} />} onClick={() => selectTab('ai')}>{t('assistantTitle')}</Button>}</div>
    </header>
    <input hidden ref={fileInput} type="file" multiple accept={accept} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void upload(files) }} />
    <input hidden ref={logoInput} type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.avif" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void upload(files) }} />
    {state.error && <div className="ent-notice" role="alert">{t(state.error)}<Button size="sm" onClick={() => { void load() }} disabled={state.busy}>{t('retry')}</Button></div>}
    {state.progress && <div className="ent-progress" role="status"><p className="ent-muted">{state.progress.percent === 100 ? t('processingFile', { name: state.progress.name }) : t('uploadProgress', { name: state.progress.name, progress: state.progress.percent })}</p><progress value={state.progress.percent} max={100} /></div>}
    {!data ? <div className="ent-empty wb-loading" role="status">{state.busy ? <><div className="wb-skeleton" aria-hidden="true"><i /><i /><i /></div><span>{t('loading')}</span></> : <Button onClick={() => { void load() }}>{t('retry')}</Button>}</div>
      : !profile ? assistant
      : <>
        <nav ref={tabList} className="ent-tabs" role="tablist" aria-label={t('title')}>{(['overview', 'supplier', 'profile', 'assets', 'opportunities', 'tasks', 'ai'] as const).map(value => <button key={value} id={`enterprise-tab-${value}`} aria-controls="enterprise-panel" tabIndex={tab === value ? 0 : -1} role="tab" className="ent-tab" aria-selected={tab === value} onKeyDown={navigateTabs} onClick={() => selectTab(value)}><ProfileIcon name={({ overview: 'overview', supplier: 'offering', profile: 'company', assets: 'commercial_policy', opportunities: 'globe', tasks: 'case', ai: 'sparkle' } satisfies Record<string, ProfileIconName>)[value]} size={17} />{t(value === 'overview' ? 'workbenchHome' : value === 'supplier' ? 'workbenchCatalog' : value === 'ai' ? 'assistantTitle' : value)}</button>)}</nav>
        <div key={tab} id="enterprise-panel" className="wb-page" role="tabpanel" aria-labelledby={`enterprise-tab-${tab}`}>
        {tab === 'overview' && <EnterpriseOverview data={data} t={t} navigate={selectTab} />}
        {tab === 'supplier' && <SupplierPanel profile={profile} t={t} generate={generate} files={assets} upload={upload} saveMedia={media => save({ ...profile, media })} />}
        {tab === 'tasks' && <TaskPanel tasks={data.tasks} busy={state.busy} t={t} command={task} />}
        {tab === 'opportunities' && <OpportunityPanel opportunities={data.opportunities} busy={state.busy} t={t} command={opportunity} research={() => { void runGeneration(`/overseas-buyer-research ${t('opportunityResearchPrompt', { name: profile.name })}`, true) }} />}
        {tab === 'profile' ? editing ? <ProfileForm initial={profile} t={t} busy={state.busy} onSave={saveProfile} onCancel={() => setEditing(false)} /> : <div>
          <div className="ent-toolbar"><h2>{t('profile')}</h2><Button variant="outline" icon={<IconEditOutline16 />} disabled={state.busy} onClick={() => setEditing(true)}>{t('edit')}</Button></div>
          {saved && <p role="status" className="wb-feedback"><span aria-hidden="true">✓</span>{t('submitted')}</p>}
          <p className="ent-status">{data.submittedAt ? t('submittedAt', { date: new Date(data.submittedAt).toLocaleString() }) : t('notSubmitted')}</p>
          <section className="ent-section"><h2>{t('basic')}</h2><dl className="ent-grid">{facts(['name', 'website', 'description', 'business'])}<div className="ent-field"><dt>{t('logo')}</dt><dd><Button variant="outline" onClick={() => setLogoPicker(true)}>{t('chooseLogo')}</Button></dd></div></dl></section>
          <section className="ent-section"><h2>{t('contacts')}</h2><dl className="ent-grid">{facts(['contact', 'email', 'phone', 'address'])}</dl></section>
        </div> : tab === 'assets' ? <div>
          <div className="ent-toolbar"><div className="ent-filters">{(['all', 'image', 'video', 'document'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(value)}</button>)}</div><Input icon={<IconSearchOutline16 />} value={search} onChange={event => setSearch(event.target.value)} aria-label={t('search')} placeholder={t('search')} /></div>
          <div className="ent-toolbar"><p className="ent-muted">{t('fileCount', { n: visible.length })}</p>{assets.length > 0 && uploadControl}</div>
          {!visible.length ? <div className="ent-empty"><IconFolderOpenOutline16 size={44} /><span>{assets.length ? t('noMatch') : t('empty')}</span>{!assets.length && uploadControl}</div> : <div className="ent-files">{visible.map(asset => <article className="ent-file" key={asset.id}>
            <button className="ent-thumb" title={t('preview')} aria-label={`${t('preview')} ${asset.name}`} onClick={() => setPreview(asset)}>{asset.category === 'image' ? <img loading="lazy" src={fileUrl(asset)} alt={asset.name} /> : asset.category === 'video' ? <video preload="metadata" src={fileUrl(asset)} muted playsInline /> : <IconFolderOpenOutline16 size={40} />}</button>
            <div className="ent-file-info"><p className="ent-file-name" title={asset.name}>{asset.name}</p><p className="ent-muted">{t(asset.category)} · {fileSizeText(asset.size)}</p><p className={`ent-knowledge ent-knowledge-${asset.knowledgeStatus}`}>{knowledgeLabel(asset)}</p><div className="ent-actions">{download(asset)}<Button size="sm" title={t('rename')} aria-label={t('rename')} disabled={state.busy} onClick={() => { setRenaming(asset); setNewName(asset.name) }}><IconEditOutline16 /></Button><Button size="sm" title={t('delete')} aria-label={t('delete')} disabled={state.busy} onClick={() => setDeleting(asset)}><IconTrashOutline16 /></Button></div></div>
          </article>)}</div>}
        </div> : tab === 'tasks' || tab === 'opportunities' || tab === 'overview' || tab === 'supplier' ? null : <div>
          {assistant}
          <section className="ent-section"><h2>{t('aiTitle')}</h2><p className="ent-muted">{t('aiDescription')}</p><p className="ent-status">{t('knowledgeCount', { ready: knowledgeReady, total: assets.length })}</p></section>
          {generationError && <p role="alert" className="ent-notice">{t('generationFailed')}</p>}
          <div className="ent-ai-grid">
            <article className="ent-ai-card"><h3>{t('companyIntro')}</h3><p>{t('companyIntroDescription')}</p><Button variant="primary" disabled={generating} onClick={() => { void runGeneration(t('companyIntroPrompt', { name: profile.name })) }}>{generating ? t('startingGeneration') : t('generateCompanyIntro')}</Button></article>
            <article className="ent-ai-card"><h3>{t('outreachEmail')}</h3><p>{t('outreachEmailDescription')}</p><Button variant="primary" disabled={generating} onClick={() => { void runGeneration(t('outreachEmailPrompt', { name: profile.name })) }}>{generating ? t('startingGeneration') : t('generateOutreachEmail')}</Button></article>
          </div>
        </div>}
        </div>
      </>}
    <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview?.name ?? t('preview')} closeLabel={t('close')} className="ent-dialog">
      {preview && <>{preview.category === 'image' ? <img className="ent-preview" src={fileUrl(preview)} alt={preview.name} /> : preview.category === 'video' ? <video className="ent-preview" src={fileUrl(preview)} controls playsInline /> : <div className="ent-empty"><IconFolderOpenOutline16 size={48} /><span>{preview.name}</span></div>}<p className="ent-muted">{t('size')}: {fileSizeText(preview.size)} · {t('createdAt')}: {new Date(preview.createdAt).toLocaleDateString()}</p><p>{download(preview)}</p></>}
    </Modal>
    <Modal open={renaming !== null} onClose={() => { if (!state.busy) setRenaming(null) }} title={t('rename')} closeLabel={t('close')} className="ent-dialog">
      <form onSubmit={event => { event.preventDefault(); if (renaming && filenameSchema.safeParse(newName).success) void rename(renaming.id, newName).then(ok => { if (ok) setRenaming(null) }) }}><label className="ent-field"><span>{t('filename')}</span><Input autoFocus value={newName} required maxLength={240} onChange={event => setNewName(event.target.value)} /></label>{state.error && <p role="alert">{t(state.error)}</p>}<Button type="submit" variant="primary" disabled={state.busy || !filenameSchema.safeParse(newName).success}>{t('save')}</Button></form>
    </Modal>
    <Modal open={deleting !== null} onClose={() => { if (!state.busy) setDeleting(null) }} title={t('deleteTitle')} closeLabel={t('close')} className="ent-dialog" description={t('deleteDescription', { name: deleting?.name ?? '' })} footer={<><Button disabled={state.busy} onClick={() => setDeleting(null)}>{t('cancel')}</Button><Button variant="primary" disabled={state.busy} onClick={() => { if (deleting) void remove(deleting.id).then(ok => { if (ok) setDeleting(null) }) }}>{t('delete')}</Button></>}>
      {state.error && <p role="alert">{t(state.error)}</p>}
    </Modal>
    <Modal open={logoPicker} onClose={() => { if (!state.busy) setLogoPicker(false) }} title={t('selectLogo')} closeLabel={t('close')} className="ent-dialog">
      <div className="ent-actions" style={{ marginBottom: 20 }}><Button disabled={state.busy} variant="outline" icon={<IconPlusOutline16 />} onClick={() => logoInput.current?.click()}>{t('upload')}</Button><Button disabled={state.busy} onClick={() => { void selectLogo(null) }}>{t('noLogo')}</Button></div>
      {state.error && <p role="alert">{t(state.error)}</p>}
      {!assets.some(file => file.category === 'image') && <p>{t('logoEmpty')}</p>}
      <div className="ent-logo-options">{assets.filter(file => file.category === 'image').map(asset => <button key={asset.id} disabled={state.busy} title={asset.name} onClick={() => { void selectLogo(asset.id) }}><img src={fileUrl(asset)} alt={asset.name} /><p>{asset.name}</p></button>)}</div>
    </Modal>
    <div className="wb-commerce" hidden={!commerceActive && (!profile || tab !== 'overview')}><CommerceEntry t={t} onActiveChange={setCommerceActive} /></div>
  </div></section>
}

/** Native composition dependencies. */
export const inject = ['slots', 'locale', 'sessions', 'layout']
/**
 * Register the locale, observable projection, and native navigation contributions.
 * @param ctx - Browser slot and locale services.
 */
export function apply(ctx: Context): void {
  const model = createModel()
  const t = ctx.locale.bind('enterprise')
  let preparing: Promise<SessionId> | undefined
  const ensureOnboarding = (): Promise<SessionId> => {
    preparing ??= (async () => {
      if (!await model.prepareOnboarding()) throw new Error('Enterprise onboarding preparation failed')
      const reserved = model.source.getSnapshot().data?.onboarding.sessionId
      if (!reserved) throw new Error('Enterprise onboarding session was not reserved')
      await ctx.sessions.refresh()
      const sessionId = ctx.sessions.list.getSnapshot().ids.find(id => id === reserved) ?? await ctx.sessions.create({ sessionId: reserved })
      const binding = ctx.sessions.binding(sessionId)
      if (!binding) throw new Error('Enterprise onboarding session is unavailable')
      if (ctx.sessions.list.getSnapshot().byId[sessionId]?.title !== t('onboardingSessionTitle')) {
        const renamed = await binding.session.rename(t('onboardingSessionTitle'))
        if (!renamed.ok) throw new Error('Enterprise onboarding title could not be saved')
      }
      return sessionId
    })().finally(() => { preparing = undefined })
    return preparing
  }
  const generate = async (prompt: string, newSession = false): Promise<boolean> => {
    try {
      const current = ctx.sessions.list.getSnapshot().current
      let sessionId = current === model.source.getSnapshot().data?.onboarding.sessionId && !prompt.startsWith('/product-geo ') ? undefined : current
      if (newSession && prompt.startsWith('/product-geo ')) {
        sessionId = await ensureOnboarding()
        if (!ctx.sessions.list.getSnapshot().byId[sessionId]?.blank) {
          ctx.sessions.open(sessionId)
          ctx.layout.selectPanel(null)
          return true
        }
      } else if (newSession) sessionId = await ctx.sessions.create()
      sessionId ??= await ctx.sessions.create()
      ctx.sessions.open(sessionId)
      ctx.layout.selectPanel(null)
      const conversation = ctx.sessions.scope(sessionId)?.get('conversation')
      if (conversation === undefined) throw new Error('Enterprise generation could not resolve the conversation service')
      await conversation.send(prompt)
      return true
    } catch (error) {
      console.error('Enterprise generation failed:', error instanceof Error ? error.message : 'Unknown conversation failure')
      return false
    }
  }
  ctx.effect(() => () => model.dispose(), 'enterprise: browser requests')
  ctx.effect(() => ctx.locale.register('enterprise', { zh, en }), 'enterprise: locale')
  ctx.effect(() => ctx.locale.register('computers', { zh: computerZh, en: computerEn }), 'computers: locale')
  ctx.effect(() => ctx.locale.register('sites', { zh: siteZh, en: siteEn }), 'sites: locale')
  ctx.effect(() => {
    const sheet = document.createElement('style')
    sheet.textContent = style + siteStyle + supplierStyle + computerMotionStyle + onboardingStyle + workbenchStyle
    document.head.append(sheet)
    return () => sheet.remove()
  }, 'enterprise: styles')
  ctx.effect(() => {
    document.body.setAttribute('data-trade-workbench', '')
    return () => document.body.removeAttribute('data-trade-workbench')
  }, 'enterprise: workspace appearance')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, () => <span className="wb-brand-mark"><ProfileIcon name="solution" size={20} /></span>)
      yield ctx.slots.register({ name: 'sidebar.brand.name', locale: 'enterprise' }, ({ t }: PropsLocale<'enterprise'>) => <span className="wb-brand-name"><strong>{t('workbenchBrand')}</strong><small>{t('workbenchBrandDetail')}</small></span>)
    }))
  const computerT = ctx.locale.bind('computers')
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'computers', order: 12, label: () => computerT('title') }, ComputersMark))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'computers', locale: 'computers' }, ComputersPanel))
  const siteT = ctx.locale.bind('sites')
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'sites', order: 11, label: () => siteT('title') }, SitesMark))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'sites', locale: 'sites', inject: () => ({ generate }) }, SitesPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'enterprise', order: 10, label: () => t('title') }, EnterpriseMark))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'enterprise', locale: 'enterprise', inject: () => ({
    load: model.load, save: model.save, upload: model.upload, rename: model.rename, remove: model.remove, task: model.task, opportunity: model.opportunity, generate, hooks: { enterprise: model.source, sessions: ctx.sessions.list },
  }) }, Panel))
  ctx.effect(() => {
    let disposed = false
    const navigation = ctx.layout.beginNavigation()
    void (async () => {
      if (!await model.load() || disposed) return
      const data = model.source.getSnapshot().data
      if (!data || data.profile || data.onboarding.completedAt) return
      await ensureOnboarding()
      if (!disposed && !navigation.aborted) ctx.layout.selectPanel('enterprise' as MainPanelId)
    })().catch(error => { console.error('Enterprise onboarding preparation failed:', error instanceof Error ? error.message : 'Unknown preparation failure') })
    return () => { disposed = true }
  }, 'enterprise: initial onboarding entry')
}
