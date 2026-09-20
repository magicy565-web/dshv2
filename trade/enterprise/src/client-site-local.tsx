/** Local publication and inbox controls use persisted server receipts, never optimistic success labels. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

const stateSchema = z.object({ generation: z.number(), revisionId: z.string().nullable(), digest: z.string().nullable(), online: z.boolean(), url: z.string().startsWith('/sites-live/') })
const reviewSchema = z.object({ revisionId: z.string(), digest: z.string(), expectedGeneration: z.number(), pageCount: z.number(), bytes: z.number() })
const inboxSchema = z.object({ total: z.number(), items: z.array(z.object({ id: z.string(), createdAt: z.string(), status: z.enum(['received', 'read', 'closed']), name: z.string(), email: z.string(), company: z.string(), product: z.string(), message: z.string() })) })

/** Manage publication on the current Host and privately process incoming inquiries.
 * @param props - Authorized site, selected revision, localized copy and publication refresh callback.
 * @returns Local publication review and private inbox.
 */
export function SiteLocalPanel({ t, siteId, revisionId, publicationChanged }: PropsLocale<'sites'> & { siteId: string; revisionId?: string | undefined; publicationChanged: () => void }) {
  const [state, setState] = useState<z.infer<typeof stateSchema>>()
  const [review, setReview] = useState<z.infer<typeof reviewSchema>>()
  const [inbox, setInbox] = useState<z.infer<typeof inboxSchema>>()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState<string>()
  const lifetime = useRef(new AbortController())
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  const request = async (action: string, body?: unknown) => {
    const response = await fetch(`/api/enterprise/sites?${new URLSearchParams({ siteId, action, ...(action === 'local-review' && revisionId ? { revisionId } : {}) })}`, { signal: lifetime.current.signal, method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
    if (!response.ok) throw new Error('site operation')
    return response.json() as Promise<unknown>
  }
  const refresh = async () => {
    const [current, messages] = await Promise.all([request('local'), request('inbox')])
    if (!lifetime.current.signal.aborted) { setState(stateSchema.parse(current)); setInbox(inboxSchema.parse(messages)) }
  }
  useEffect(() => { void refresh().catch(() => { if (!lifetime.current.signal.aborted) setError(true) }) }, [])
  const act = async (run: () => Promise<void>) => {
    if (busy || lifetime.current.signal.aborted) return
    setBusy(true); setError(false)
    try { await run() }
    catch { if (!lifetime.current.signal.aborted) setError(true) }
    finally { if (!lifetime.current.signal.aborted) setBusy(false) }
  }
  return <section className="site-hosting"><h3>{t('localTitle')}</h3><p>{t('localDetail')}</p>
    {error && <p role="alert">{t('localError')}</p>}
    <div className="ent-actions"><Button disabled={busy} onClick={() => { void act(refresh) }}>{t('localRefresh')}</Button><Button disabled={busy || !revisionId} onClick={() => { void act(async () => { setReview(undefined); setConfirmed(false); const next = reviewSchema.parse(await request('local-review')); if (!lifetime.current.signal.aborted) setReview(next) }) }}>{t('localReview')}</Button></div>
    {state && <p role="status">{t(state.online ? 'online' : 'offline')}{state.online && <> · <a href={state.url} target="_blank" rel="noreferrer">{t('visitLive')}</a> · <Button disabled={busy} onClick={() => { void act(async () => { await request('local-offline', { expectedGeneration: state.generation, confirmed: true }); setReview(undefined); await refresh(); publicationChanged() }) }}>{t('unpublish')}</Button></>}</p>}
    {review && <div className="site-publish-review"><p>{t('localReviewDetail', { count: String(review.pageCount) })}</p><code>{review.revisionId}</code><p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> {t('confirmPublic')}</label></p><Button variant="primary" disabled={busy || !confirmed} onClick={() => { void act(async () => { await request('local-publish', { revisionId: review.revisionId, digest: review.digest, expectedGeneration: review.expectedGeneration, confirmed: true }); setReview(undefined); setConfirmed(false); await refresh(); publicationChanged() }) }}>{t('localPublish')}</Button></div>}
    <h3>{t('inboxTitle')}</h3><p>{t('inboxDetail')}</p>{inbox && <p>{t('inboxCount', { count: String(inbox.total) })}</p>}
    <div className="site-deployments">{inbox?.items.map(item => <article key={item.id}><div><strong>{item.name}</strong><span>{t(item.status === 'received' ? 'inquiryReceived' : item.status === 'read' ? 'inquiryRead' : 'inquiryClosed')}</span><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.email} · {item.company}</p><p>{item.product}</p><p className="site-inquiry-message">{item.message}</p><div className="ent-actions">{(['read', 'close'] as const).map(action => <Button key={action} disabled={busy} onClick={() => { void act(async () => { await request('inquiry', { id: item.id, action }); await refresh() }) }}>{t(action === 'read' ? 'markInquiryRead' : 'closeInquiry')}</Button>)}<Button disabled={busy} onClick={() => setDeleting(item.id)}>{t('deleteInquiry')}</Button>{deleting === item.id && <Button disabled={busy} onClick={() => { void act(async () => { await request('inquiry', { id: item.id, action: 'delete' }); setDeleting(undefined); await refresh() }) }}>{t('confirmDeleteInquiry')}</Button>}</div></article>)}</div>
  </section>
}
