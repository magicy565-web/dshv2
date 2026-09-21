/** Interactive component collection; all actions are isolated to this preview's memory. */
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ActionButton, ActivityList, EmptyState, MetricCard, ProductCard, ProgressSteps, ReviewCard, SectionHeading, SegmentedControl, SourceRow, StatusBadge, Surface, TextField } from './components.tsx'
import { ProfileIcon } from '../profile-icons.tsx'
import type { ProfileIconName } from '../profile-icons.tsx'
import { designZh, designEn } from './showcase-copy.ts'
import './design.css'
import './showcase.css'

function Showcase() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activeSection, setActiveSection] = useState('overview')
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')
  const [search, setSearch] = useState('')
  const [review, setReview] = useState<'pending' | 'approved' | 'input'>('pending')
  const [saved, setSaved] = useState(false), [created, setCreated] = useState(false)
  const [email, setEmail] = useState(''), [emailTouched, setEmailTouched] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [details, setDetails] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const c = locale === 'zh' ? designZh : designEn
  useEffect(() => { document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; document.title = `${c.brand} · ${c.brandCaption}` }, [locale, c])
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActiveSection(entry.target.id)
    }, { rootMargin: '-5% 0px -65% 0px' })
    for (const id of ['overview', 'workflow', 'products', 'foundations']) {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    }
    return () => observer.disconnect()
  }, [])
  const openDetails = (name: string) => { setDetails(name); dialog.current?.showModal() }
  const files = c.files.filter(file => (filter === 'all' || (filter === 'pending' ? file.id === 'catalog' : file.id !== 'catalog')) && `${file.name} ${file.format}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const nav = [{ id: 'overview', label: c.navOverview, icon: 'overview' }, { id: 'workflow', label: c.navWorkflow, icon: 'commercial_policy' }, { id: 'products', label: c.navProducts, icon: 'offering' }, { id: 'foundations', label: c.navFoundation, icon: 'settings' }] as const
  const action = (state: typeof review) => { setReview(state); setAnnouncement(state === 'approved' ? c.reviewApprovedToast : c.reviewInputToast) }
  return <div className="td-root td-showcase" data-theme={theme}>
    <aside className="td-sidebar"><a className="td-brand" href="#overview"><span className="td-brand-symbol" aria-hidden="true"><i /><i /><i /></span><div><strong>{c.brand}</strong><small>{c.brandCaption}</small></div></a>
      <div className="td-nav-label">{c.navLabel}</div><nav aria-label={c.navLabel}>{nav.map((item, index) => <a key={item.id} href={`#${item.id}`} aria-current={activeSection === item.id ? 'location' : undefined} onClick={() => setActiveSection(item.id)}><ProfileIcon name={item.icon} size={18} /><span>{item.label}</span><small>0{index + 1}</small></a>)}</nav>
      <div className="td-sidebar-bottom"><div className="td-sidebar-orbit" aria-hidden="true"><span /><i /></div><p>{c.navFoot}</p><span>{c.version}</span></div>
    </aside>
    <main className="td-main"><header className="td-topbar"><span>{c.edition}</span><div><StatusBadge tone="success">{c.preview}</StatusBadge><button type="button" className="td-top-control" aria-label={c.theme} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M12 5a7 7 0 0 1 0 14Z" fill="currentColor" /></svg></button><button className="td-top-control" type="button" aria-label={c.language} onClick={() => { setLocale(locale === 'zh' ? 'en' : 'zh'); setAnnouncement('') }}>{locale === 'zh' ? 'EN' : '中'}</button></div></header>
      <section id="overview" className="td-overview"><div className="td-intro"><div><h1>{c.title}</h1><p>{c.introduction}</p></div><a className="td-explore" href="#workflow">{c.jump}<ProfileIcon name="arrow" size={17} /></a></div>
        <div className="td-hero-grid"><div className="td-hero"><div className="td-hero-art" aria-hidden="true"><div /><div /><div /><span>F</span></div><span className="td-eyebrow">{c.heroLabel}</span><h2>{c.heroTitle}</h2><p>{c.heroText}</p><a className="td-button td-hero-button" href="#review">{c.heroAction}<ProfileIcon name="arrow" size={17} /></a><small>{c.heroMeta}</small></div>
          <Surface className="td-palette"><span className="td-eyebrow">{c.paletteSubtitle}</span><h2>{c.paletteTitle}</h2><div className="td-swatches">{['#234C3C', '#D6EEAA', '#F5F5F0', '#202B25'].map((color, index) => <div key={color}><span style={{ background: color }} /><strong>{c.paletteNames[index]}</strong><small>{color}</small></div>)}</div><p>{c.paletteNote}</p><div className="td-palette-type" aria-hidden="true"><strong>Aa</strong><span>字</span><small>LESS, BUT BETTER.</small></div></Surface></div>
        <div className="td-metrics">{c.metrics.map((metric, index) => <MetricCard key={metric.label} {...metric} icon={metric.icon as ProfileIconName} tone={index === 1 ? 'warning' : index === 2 ? 'success' : 'neutral'} />)}</div>
      </section>
      <section id="workflow" className="td-block"><SectionHeading index="01" title={c.workflowTitle} description={c.workflowDescription} /><Surface className="td-progress-panel"><ProgressSteps label={c.flowLabel} steps={c.steps.map((step, index) => ({ ...step, id: String(index), state: index < 2 ? 'complete' : index === 2 ? 'current' : 'upcoming' }))} /></Surface>
        <div className="td-workflow-grid"><Surface className="td-library"><div className="td-library-heading"><div><span className="td-eyebrow">{c.sourcesCaption}</span><h3>{c.sourcesTitle}</h3></div><span>{c.sourceCount}</span></div><div className="td-library-tools"><SegmentedControl label={c.filterLabel} value={filter} onChange={setFilter} options={[{ value: 'all', label: c.all }, { value: 'pending', label: c.pending }, { value: 'completed', label: c.completed }]} /><ProfileIcon name="search" size={17} /></div><TextField className="td-search-field" label={c.searchLabel} placeholder={c.searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} type="search" />
          <div className="td-source-list">{files.map(file => <SourceRow key={file.id} {...file} tone={file.id === 'catalog' ? 'warning' : 'success'} action={<ActionButton size="small" variant="quiet" aria-label={`${c.view} ${file.name}`} onClick={() => openDetails(file.name)}>{c.view}<ProfileIcon name="arrowUp" size={14} /></ActionButton>} />)}{!files.length && <EmptyState title={c.noResults} description={c.noResultsHint} icon="search" action={<ActionButton size="small" variant="secondary" onClick={() => { setFilter('all'); setSearch('') }}>{c.reset}</ActionButton>} />}</div></Surface>
          <div id="review"><ReviewCard eyebrow={c.reviewEyebrow} title={c.reviewTitle} status={<StatusBadge tone={review === 'approved' ? 'success' : 'warning'}>{review === 'approved' ? c.approved : review === 'input' ? c.needsInputStatus : c.pending}</StatusBadge>} citation={c.citation} note={c.reviewNote} actions={review === 'pending' ? <><ActionButton onClick={() => action('approved')}>{c.approve}<ProfileIcon name="arrow" size={15} /></ActionButton><ActionButton variant="quiet" onClick={() => action('input')}>{c.needsInput}</ActionButton></> : <ActionButton variant="secondary" onClick={() => { setReview('pending'); setAnnouncement('') }}>{c.undo}</ActionButton>}>{c.reviewText}</ReviewCard></div>
        </div>
      </section>
      <section id="products" className="td-block"><SectionHeading index="02" title={c.productTitle} description={c.productDescription} /><div className="td-products-grid"><ProductCard category={c.productCategory} title={c.productName} description={c.productText} status={<StatusBadge>{c.productStatus}</StatusBadge>} specifications={[{ label: c.productMaterial, value: c.productMaterialValue }, { label: c.productWeight, value: c.productWeightValue }]} media={<div className="td-material-art" role="img" aria-label={c.materialArt}><small>{c.materialArtLabel}</small><div className="td-material-stack"><i /><i /><i /></div><span>{c.materialArtFoot}</span></div>} actions={<><ActionButton variant="secondary" size="small" onClick={() => openDetails(c.productName)}>{c.productOpen}<ProfileIcon name="arrowUp" size={14} /></ActionButton><ActionButton variant="quiet" size="small" aria-pressed={saved} onClick={() => setSaved(!saved)}>{saved ? c.saved : c.save}</ActionButton></>} />
          <Surface className="td-activity-panel"><span className="td-eyebrow">{c.activityCaption}</span><h3>{c.activityTitle}</h3><ActivityList label={c.activityLabel} items={c.activities.map((item, index) => ({ ...item, id: String(index), tone: index === 1 ? 'warning' : 'success' }))} /></Surface></div></section>
      <section id="foundations" className="td-block"><SectionHeading index="03" title={c.foundationsTitle} description={c.foundationsDescription} /><div className="td-foundations-grid"><Surface className="td-controls-panel"><span className="td-eyebrow">{c.buttonsCaption}</span><h3>{c.buttonsTitle}</h3><div className="td-example-actions"><ActionButton onClick={() => setAnnouncement(c.actionToast)} icon={<ProfileIcon name="sparkle" size={16} />}>{c.primary}</ActionButton><ActionButton variant="secondary" onClick={() => setAnnouncement(c.actionToast)}>{c.secondary}</ActionButton><ActionButton variant="quiet" onClick={() => setAnnouncement(c.actionToast)}>{c.quiet}</ActionButton><ActionButton loading>{c.loading}</ActionButton><ActionButton variant="secondary" disabled>{c.disabled}</ActionButton></div><div className="td-controls-divider" /><span className="td-eyebrow">{c.statusesCaption}</span><h3>{c.statusesTitle}</h3><div className="td-example-badges"><StatusBadge>{c.neutral}</StatusBadge><StatusBadge tone="success">{c.success}</StatusBadge><StatusBadge tone="warning">{c.warning}</StatusBadge><StatusBadge tone="info">{c.info}</StatusBadge><StatusBadge tone="danger">{c.danger}</StatusBadge></div></Surface>
        <Surface className="td-form-panel"><span className="td-eyebrow">{c.fieldsCaption}</span><h3>{c.fieldsTitle}</h3><TextField label={c.fieldName} placeholder={c.fieldPlaceholder} hint={c.fieldHint} /><TextField label={c.fieldEmail} type="email" placeholder={c.fieldEmailPlaceholder} value={email} onChange={event => setEmail(event.target.value)} onBlur={() => setEmailTouched(true)} error={emailTouched && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? c.emailError : undefined} /></Surface>
        <Surface><EmptyState title={created ? c.createdTitle : c.emptyTitle} description={created ? c.createdText : c.emptyText} action={!created ? <ActionButton variant="secondary" size="small" onClick={() => setCreated(true)}>{c.emptyAction}<ProfileIcon name="arrow" size={14} /></ActionButton> : <StatusBadge>{c.neutral}</StatusBadge>} /></Surface></div></section>
      <footer className="td-footer"><span>{c.footer}</span><small>{c.footerNote}</small></footer>
    </main>
    <div className={`td-toast ${announcement ? 'td-toast--visible' : ''}`} role="status" aria-live="polite">{announcement}</div>
    <dialog ref={dialog} className="td-preview-dialog" aria-labelledby="td-dialog-title"><div className="td-card-top"><span className="td-eyebrow">{c.dialogTitle}</span><ActionButton variant="quiet" size="small" onClick={() => dialog.current?.close()}>{c.close}</ActionButton></div><h2 id="td-dialog-title">{details}</h2><p>{c.dialogSourceText}</p><div className="td-review-excerpt">{c.reviewText}</div><p className="td-citation">{c.citation}</p><p>{c.dialogNote}</p></dialog>
  </div>
}

const mount = document.getElementById('root')
if (!mount) throw new Error('Missing design preview root')
createRoot(mount).render(<Showcase />)
