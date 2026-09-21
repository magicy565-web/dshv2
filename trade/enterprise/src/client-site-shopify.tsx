/** Human review fixes the source revision, destination and file digest before queueing. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

const optionsSchema = z.object({ connections: z.array(z.object({ id: z.string(), name: z.string() })), themes: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })) })
const reviewSchema = z.object({ revisionId: z.string(), connectionId: z.string(), themeId: z.string(), themeName: z.string(), digest: z.string(), files: z.record(z.string(), z.string()) })
const jobsSchema = z.object({ items: z.array(z.object({ id: z.string(), revisionId: z.string(), status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']), error: z.string().optional(), attempts: z.array(z.object({ number: z.number(), status: z.enum(['running', 'succeeded', 'failed']), error: z.string().optional() })).optional() })) })

/** Review theme templates and track durable publication attempts.
 * @param props - Saved site selection and localized presentation.
 * @returns Shopify controls; arbitrary source projects remain on their own hosting path.
 */
export function SiteShopifyPanel({ siteId, revisionId, expectedRevisionId, sourceProject, disabled, t }: PropsLocale<'sites'> & { siteId: string; revisionId?: string | undefined; expectedRevisionId?: string | undefined; sourceProject: boolean; disabled: boolean }) {
  const [options, setOptions] = useState<z.infer<typeof optionsSchema>>()
  const [connectionId, setConnection] = useState('')
  const [themeId, setTheme] = useState('')
  const [shop, setShop] = useState('')
  const [review, setReview] = useState<z.infer<typeof reviewSchema>>()
  const [confirmed, setConfirmed] = useState(false)
  const [jobs, setJobs] = useState<z.infer<typeof jobsSchema>['items']>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const lifetime = useRef(new AbortController())
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  const request = async (action: string, body?: unknown, extra: Record<string, string> = {}, signal = lifetime.current.signal) => {
    const response = await fetch(`/api/enterprise/sites?${new URLSearchParams({ siteId, action, ...extra })}`, { signal, credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
    if (!response.ok) throw new Error('Shopify request failed')
    return response.json() as Promise<unknown>
  }
  const refresh = async () => { setJobs(jobsSchema.parse(await request('jobs')).items) }
  useEffect(() => {
    const pending = new AbortController()
    setReview(undefined); setConfirmed(false); setTheme(''); setOptions(undefined)
    void request('shopify-options', undefined, connectionId ? { connectionId } : {}, pending.signal).then(value => setOptions(optionsSchema.parse(value))).catch(() => { if (!pending.signal.aborted) setError(true) })
    return () => pending.abort()
  }, [siteId, connectionId])
  useEffect(() => { setReview(undefined); setConfirmed(false) }, [revisionId, expectedRevisionId, themeId])
  const run = async (operation: () => Promise<void>) => {
    if (busy || lifetime.current.signal.aborted) return
    setBusy(true); setError(false)
    try { await operation() } catch { if (!lifetime.current.signal.aborted) setError(true) }
    finally { if (!lifetime.current.signal.aborted) setBusy(false) }
  }
  return <section><p>{t('shopifyHelp')}</p>{sourceProject && <p>{t('shopifySourceUnsupported')}</p>}{error && <p role="alert">{t('error')}</p>}<fieldset disabled={disabled || busy}>
    <label>{t('shopifyDomain')}<Input value={shop} placeholder="example.myshopify.com" onChange={event => setShop(event.target.value)} /></label>{/^[a-z0-9-]+\.myshopify\.com$/.test(shop) && <a href={`/api/enterprise/shopify/oauth/start?${new URLSearchParams({ shop, themes: 'true' })}`} target="_blank" rel="noreferrer">{t('shopifyConnect')}</a>}
    <div className="site-toolbar"><label>{t('shopifyStore')}<select value={connectionId} onChange={event => { setConnection(event.target.value); setError(false) }}><option value="">{t('shopifyChoose')}</option>{options?.connections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('shopifyTheme')}<select value={themeId} onChange={event => setTheme(event.target.value)}><option value="">{t('shopifyChoose')}</option>{options?.themes.filter(item => item.role === 'unpublished').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button disabled={sourceProject || !revisionId || !themeId || !connectionId} onClick={() => { void run(async () => { setReview(reviewSchema.parse(await request('shopify-review', { revisionId, connectionId, themeId }))); setConfirmed(false) }) }}>{t('shopifyReview')}</Button></div>
    {options && !options.connections.length && <p>{t('shopifyNoStores')}</p>}
    {review && <div><p>{t('shopifyReviewWarning')}</p><p>{review.themeName} · {review.revisionId}</p>{Object.entries(review.files).map(([path, content]) => <details key={path}><summary>{path}</summary><pre>{content}</pre></details>)}<label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t('shopifyConfirm')}</label><Button disabled={!confirmed || !expectedRevisionId} onClick={() => { void run(async () => { await request('publish', { revisionId: review.revisionId, expectedRevisionId, target: { connectionId: review.connectionId, themeId: review.themeId, digest: review.digest }, confirmed: true }); setReview(undefined); setConfirmed(false); await refresh() }) }}>{t('shopifyQueue')}</Button></div>}
    <Button onClick={() => { void run(refresh) }}>{t('shopifyRefreshJobs')}</Button>
  </fieldset><ol>{jobs.map(job => <li key={job.id}>{job.revisionId} · {t(job.status)}{job.error && <p>{job.error}</p>}{job.attempts?.map(attempt => <p key={attempt.number}>{t('shopifyAttempt', { number: String(attempt.number) })} · {t(attempt.status)}{attempt.error ? `: ${attempt.error}` : ''}</p>)}{job.status === 'queued' && <Button disabled={busy || disabled} onClick={() => { void run(async () => { await request('cancel', { jobId: job.id }); await refresh() }) }}>{t('cancel')}</Button>}</li>)}</ol></section>
}
