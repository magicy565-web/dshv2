/** Local publication and inbox controls use persisted server receipts, never optimistic success labels. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { siteGrowth, inquiryAttribution } from './site-growth-schema.ts'

const stateSchema = z.object({ generation: z.number(), revisionId: z.string().nullable(), digest: z.string().nullable(), online: z.boolean(), url: z.string().startsWith('/sites-live/') })
const reviewSchema = z.object({ revisionId: z.string(), digest: z.string(), expectedGeneration: z.number(), pageCount: z.number(), bytes: z.number(), publicUrl: z.url(), analytics: z.boolean(), agent: z.boolean() })
const inboxSchema = z.object({ total: z.number(), items: z.array(z.object({ id: z.string(), createdAt: z.string(), status: z.enum(['received', 'read', 'closed']), name: z.string(), email: z.string(), company: z.string(), product: z.string(), message: z.string(), attribution: inquiryAttribution.optional() })) })
const growthSchema = z.object({ online: z.boolean(), agent: z.boolean(), analytics: siteGrowth.shape.analytics.nullable(), publicUrl: z.string().nullable(), inquiries: z.number() })

/** Manage publication on the current Host and privately process incoming inquiries.
 * @param props - Authorized site, selected revision, localized copy and publication refresh callback.
 * @returns Local publication review and private inbox.
 */
export function SiteLocalPanel({ t, siteId, revisionId, publicationChanged, mode, disabled, active }: PropsLocale<'sites'> & { siteId: string; revisionId?: string | undefined; publicationChanged: () => void; mode: 'publication' | 'inquiries'; disabled: boolean; active: boolean }) {
  const [state, setState] = useState<z.infer<typeof stateSchema>>()
  const [review, setReview] = useState<z.infer<typeof reviewSchema>>()
  const [inbox, setInbox] = useState<z.infer<typeof inboxSchema>>()
  const [growth, setGrowth] = useState<z.infer<typeof growthSchema>>()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [followed, setFollowed] = useState<string>()
  const [deleting, setDeleting] = useState<string>()
  const [filter, setFilter] = useState('all')
  const lifetime = useRef(new AbortController())
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  const request = async (action: string, body?: unknown) => {
    const response = await fetch(`/api/enterprise/sites?${new URLSearchParams({ siteId, action, ...(action === 'local-review' && revisionId ? { revisionId } : {}) })}`, { signal: lifetime.current.signal, method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
    if (!response.ok) throw new Error('site operation')
    return response.json() as Promise<unknown>
  }
  const refresh = async () => {
    const [current, messages, integrations] = await Promise.all([request('local'), request('inbox'), request('growth')])
    if (!lifetime.current.signal.aborted) { setState(stateSchema.parse(current)); setInbox(inboxSchema.parse(messages)); setGrowth(growthSchema.parse(integrations)) }
  }
  useEffect(() => { if (active) void refresh().catch(() => { if (!lifetime.current.signal.aborted) setError(true) }) }, [active])
  const act = async (run: () => Promise<void>) => {
    if (busy || disabled || lifetime.current.signal.aborted) return
    setBusy(true); setError(false)
    try { await run() }
    catch { if (!lifetime.current.signal.aborted) setError(true) }
    finally { if (!lifetime.current.signal.aborted) setBusy(false) }
  }
  return <section className="site-hosting site-local">{error && <p role="alert">{t('localError')}</p>}<fieldset className="site-panel-body" disabled={busy || disabled}>{mode === 'publication' && <><h3>{t('localTitle')}</h3><p>{t('localDetail')}</p>
    <div className="ent-actions"><Button disabled={busy} onClick={() => { void act(refresh) }}>{t('localRefresh')}</Button><Button variant="primary" disabled={busy || !revisionId} onClick={() => { void act(async () => { setReview(undefined); setConfirmed(false); const next = reviewSchema.parse(await request('local-review')); if (!lifetime.current.signal.aborted) setReview(next) }) }}>{t('localReview')}</Button></div>
    {state && <p role="status">{t(state.online ? 'online' : 'offline')}{state.online && <> · <a href={growth?.publicUrl ?? state.url} target="_blank" rel="noreferrer">{t('visitLive')}</a> · <Button disabled={busy} onClick={() => { void act(async () => { await request('local-offline', { expectedGeneration: state.generation, confirmed: true }); setReview(undefined); await refresh(); publicationChanged() }) }}>{t('unpublish')}</Button></>}</p>}
    {review && <div className="site-publish-review"><p>{t('localReviewDetail', { count: String(review.pageCount) })}</p><dl className="site-launch-checks"><div><dt>{t('launchAddress')}</dt><dd><a href={review.publicUrl} target="_blank" rel="noreferrer">{review.publicUrl}</a></dd></div><div><dt>{t('launchDiscovery')}</dt><dd>{t('launchDiscoveryReady')}</dd></div><div><dt>{t('enableAgent')}</dt><dd>{t(review.agent ? 'launchEnabled' : 'launchDisabled')}</dd></div><div><dt>{t('opsTraffic')}</dt><dd>{t(review.analytics ? 'launchConnected' : 'launchDisabled')}</dd></div></dl><p className="ent-muted">{t('launchCheckHelp')}</p>{new URL(review.publicUrl).protocol !== 'https:' && <p className="ent-notice">{t('launchLocalAddress')}</p>}<details><summary>{t('history')}</summary><code>{review.revisionId}</code></details><p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> {t('confirmPublic')}</label></p><Button variant="primary" disabled={busy || !confirmed} onClick={() => { void act(async () => { await request('local-publish', { revisionId: review.revisionId, digest: review.digest, expectedGeneration: review.expectedGeneration, confirmed: true }); setReview(undefined); setConfirmed(false); await refresh(); publicationChanged() }) }}>{t('localPublish')}</Button></div>}
    <div className="site-launch-links">{growth?.analytics ? <a href={growth.analytics.dashboardUrl} target="_blank" rel="noopener noreferrer">{t('analyticsOpen')}</a> : <p>{t('analyticsMissing')}</p>}{growth?.online && growth.publicUrl && <p><a href={`${growth.publicUrl}sitemap.xml`} target="_blank" rel="noopener noreferrer">{t('discoveryOpen')}</a></p>}{growth?.agent && <p>{t('agentEnabled')}</p>}
    </div></>}{mode === 'inquiries' && <><h3>{t('inboxTitle')}</h3><Button disabled={busy} onClick={() => { void act(refresh) }}>{t('localRefresh')}</Button><p>{t('inboxDetail')}</p>{inbox && <p>{t('inboxCount', { count: String(inbox.total) })}</p>}
    {inbox?.total === 0 && <div className="site-empty-state"><strong>{t('inboxEmpty')}</strong><p>{t('inboxEmptyHelp')}</p></div>}
    {Boolean(inbox?.total) && <div className="site-inbox-filters"><label>{t('inboxFilter')}<select value={filter} onChange={event => setFilter(event.target.value)}>{(['all', 'received', 'read', 'closed'] as const).map(value => <option key={value} value={value}>{t(value === 'all' ? 'inboxAll' : value === 'received' ? 'inquiryReceived' : value === 'read' ? 'inquiryRead' : 'inquiryClosed')}</option>)}</select></label></div>}
    <details className="site-secondary-options"><summary>{t('followupSettings')}</summary><div className="ent-actions"><label>{t('followupAssignee')}<input value={assignee} maxLength={160} onChange={event => setAssignee(event.target.value)} /></label><label>{t('followupDue')}<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label></div></details>
    <div className="site-deployments">{inbox?.items.filter(item => filter === 'all' || item.status === filter).map(item => <article key={item.id}><div><strong>{item.name}</strong><span>{t(item.status === 'received' ? 'inquiryReceived' : item.status === 'read' ? 'inquiryRead' : 'inquiryClosed')}</span><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.email} · {item.company}</p><p>{item.product}</p>{item.attribution && <p>{t('inquirySource')}: {[item.attribution.source, item.attribution.medium, item.attribution.campaign, item.attribution.referrerHost, item.attribution.landingPath].filter(Boolean).join(' · ')}</p>}<p className="site-inquiry-message">{item.message}</p><div className="ent-actions"><Button disabled={busy} onClick={() => { void act(async () => { await request('ops-followup', { id: item.id, assignee, dueDate: dueDate || null }); setFollowed(item.id) }) }}>{t('followupCreate')}</Button>{followed === item.id && <p role="status">{t('followupDone')}</p>}{(['read', 'close'] as const).map(action => <Button key={action} disabled={busy} onClick={() => { void act(async () => { await request('inquiry', { id: item.id, action }); await refresh() }) }}>{t(action === 'read' ? 'markInquiryRead' : 'closeInquiry')}</Button>)}<Button disabled={busy} onClick={() => setDeleting(item.id)}>{t('deleteInquiry')}</Button>{deleting === item.id && <><Button onClick={() => setDeleting(undefined)}>{t('cancel')}</Button><Button disabled={busy} onClick={() => { void act(async () => { await request('inquiry', { id: item.id, action: 'delete' }); setDeleting(undefined); await refresh() }) }}>{t('confirmDeleteInquiry')}</Button></>}</div></article>)}</div></>}
    </fieldset>
  </section>
}
