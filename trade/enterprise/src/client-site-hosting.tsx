/** Human review and exact-build publication controls for independently hosted Sites. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { hostingStateSchema, type SiteDeployment } from './site-hosting-schema.ts'
import { SiteDomainsPanel } from './client-site-domains.tsx'

const responseSchema = hostingStateSchema.safeExtend({ configured: z.boolean() })
type Props = PropsLocale<'sites'> & { siteId: string; revisionId: string | undefined }

/** Show protected cloud builds and require review of an exact deployment before publication.
 * @param props - Localized copy and the selected saved source revision.
 * @returns Deployment controls; unavailable hosting remains explicitly disabled.
 */
export function SiteHostingPanel({ siteId, revisionId, t }: Props) {
  const [state, setState] = useState<z.infer<typeof responseSchema>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [review, setReview] = useState<{ deployment: SiteDeployment; expectedLiveDeploymentId: string | null }>()
  const [confirmed, setConfirmed] = useState(false)
  const [availabilityReview, setAvailabilityReview] = useState<{ paused: boolean; expectedLiveDeploymentId: string }>()
  const lifetime = useRef(new AbortController())
  const request = async (action: string, signal: AbortSignal, body?: unknown) => {
    const response = await fetch(`/api/enterprise/sites?${new URLSearchParams({ siteId, action })}`, {
      signal, credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
    if (!response.ok) throw new Error('hosting')
    return response.json() as Promise<unknown>
  }
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    setState(undefined); setReview(undefined); setAvailabilityReview(undefined); setConfirmed(false); setError(false)
    void request('hosting', controller.signal).then(value => setState(responseSchema.parse(value))).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [siteId])
  const run = async (action: string, body: unknown) => {
    if (busy) return
    const signal = lifetime.current.signal
    setBusy(true); setError(false)
    try {
      let accepted = false
      try { await request(action, signal, body); accepted = true }
      catch { if (signal.aborted) return }
      const updated = responseSchema.parse(await request('hosting', signal))
      if (!signal.aborted) {
        setState(updated); setError(!accepted)
        if (accepted) { setReview(undefined); setAvailabilityReview(undefined); setConfirmed(false) }
      }
    } catch { if (!signal.aborted) setError(true) }
    finally { if (!signal.aborted) setBusy(false) }
  }
  const locked = Boolean(state?.pendingPromotionId || state?.pendingAvailability || state?.pendingDomain)
  const currentDeploymentId = state?.liveDeploymentId
  return <section className="site-hosting" aria-label={t('hostingTitle')}>
    <div className="site-toolbar"><h2>{t('hostingTitle')}</h2>{state?.liveDeploymentId && <span>{t(state.availability ?? 'unknown')}</span>}{state?.productionUrl && state.availability === 'online' && <a href={state.productionUrl} target="_blank" rel="noopener noreferrer">{t('visitLive')}</a>}</div>
    {error && <p role="alert">{t('hostingError')}</p>}
    {!state ? <p>{t('loading')}</p> : !state.configured ? <p className="ent-muted">{t('hostingPending')}</p> : <>
      <p className="ent-muted">{t('hostingDetail')}</p>
      <div className="site-toolbar"><Button disabled={busy || !revisionId || locked} onClick={() => { void run('stage', { revisionId }) }}>{t('stageBuild')}</Button><Button disabled={busy} onClick={() => { void run('hosting-refresh', {}) }}>{t('refreshBuilds')}</Button>{currentDeploymentId && state.availability !== 'unknown' && state.availability !== undefined && <Button disabled={busy || locked} onClick={() => { setReview(undefined); setAvailabilityReview({ paused: state.availability === 'online', expectedLiveDeploymentId: currentDeploymentId }) }}>{t(state.availability === 'online' ? 'unpublish' : 'resumeWebsite')}</Button>}</div>
      {state.pendingPromotionId && <p role="status">{t('promotionPending')}</p>}
      {state.pendingAvailability && <p role="status">{t('availabilityPending')}</p>}
      {state.operationError && <p role="alert">{t('hostingError')}</p>}
      {availabilityReview && <div className="site-publish-review" role="region" aria-label={t(availabilityReview.paused ? 'unpublish' : 'resumeWebsite')}>
        <h3>{t(availabilityReview.paused ? 'unpublish' : 'resumeWebsite')}</h3><p>{t(availabilityReview.paused ? 'unpublishDetail' : 'resumeDetail')}</p>
        <div className="site-toolbar"><Button variant="primary" disabled={busy || locked} onClick={() => { void run('hosting-availability', { ...availabilityReview, confirmed: true }) }}>{t(availabilityReview.paused ? 'confirmUnpublish' : 'confirmResume')}</Button><Button disabled={busy} onClick={() => setAvailabilityReview(undefined)}>{t('cancelReview')}</Button></div>
      </div>}
      <div className="site-deployments">{state.deployments.map(deployment => <article key={deployment.id}>
        <div><strong>{new Date(deployment.createdAt).toLocaleString()}</strong><span>{t(deployment.status)}</span>{state.liveDeploymentId === deployment.id && <strong>{t(state.availability ?? 'unknown')}</strong>}</div>
        <p className="ent-muted">{t('history')}: <code>{deployment.revisionId}</code></p>
        {deployment.status === 'unknown' && <p>{t('unknownBuild')}</p>}
        {deployment.status === 'failed' && <details open><summary>{t('buildDiagnostics')}</summary>{deployment.error && <pre className="site-build-log">{deployment.error}</pre>}{deployment.buildLog === undefined ? deployment.buildId && <p>{t('buildLogUnavailable')}</p> : deployment.buildLog && <><p>{t('buildLogTail')}</p><pre className="site-build-log">{deployment.buildLog}</pre></>}</details>}
        <div className="site-toolbar">{deployment.previewUrl && <a href={deployment.previewUrl} target="_blank" rel="noopener noreferrer">{t('openCloudPreview')}</a>}<Button disabled={busy || deployment.status !== 'ready' || locked || state.availability === 'offline' || state.liveDeploymentId === deployment.id} onClick={() => { setAvailabilityReview(undefined); setReview({ deployment, expectedLiveDeploymentId: state.liveDeploymentId ?? null }); setConfirmed(false) }}>{t(deployment.published ? 'rollbackLive' : 'reviewPublish')}</Button></div>
      </article>)}</div>
      {review && <div className="site-publish-review" role="region" aria-label={t('reviewPublish')}>
        <h3>{t('reviewPublish')}</h3><p>{t('publishDetail')}</p><p><code>{review.deployment.revisionId}</code></p><p className="ent-muted"><code>{review.deployment.digest}</code></p>
        <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> {t('confirmPublic')}</label>
        <div className="site-toolbar"><Button variant="primary" disabled={busy || !confirmed} onClick={() => { void run('hosting-publish', { deploymentId: review.deployment.id, digest: review.deployment.digest, expectedLiveDeploymentId: review.expectedLiveDeploymentId, confirmed: true }) }}>{t('publishExact')}</Button><Button disabled={busy} onClick={() => setReview(undefined)}>{t('cancelReview')}</Button></div>
      </div>}
      <SiteDomainsPanel state={state} disabled={busy || locked} change={input => run('hosting-domain', input)} t={t} />
    </>}
  </section>
}
