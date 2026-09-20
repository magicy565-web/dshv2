/** Review the exact company projection before saving a portable website draft. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { siteCompanyReview } from './site-company-schema.ts'

/** Company import owns its request lifetime and never publishes the generated draft.
 * @param props - Localized copy, design choice and completion callback.
 * @returns Reviewable company content and an explicit public-content confirmation.
 */
export function SiteCompanyPanel({ t, style, created }: PropsLocale<'sites'> & { style: string; created: (site: { id: string; name: string; currentRevisionId?: string | undefined }) => void }) {
  const [review, setReview] = useState<z.infer<typeof siteCompanyReview>>()
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const lifetime = useRef(new AbortController())
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  const load = async () => {
    setBusy(true); setConfirmed(false); setError(false); setReview(undefined)
    try {
      const response = await fetch('/api/enterprise/sites?action=company-source', { signal: lifetime.current.signal })
      if (!response.ok) throw new Error('review')
      const value = siteCompanyReview.parse(await response.json())
      if (!lifetime.current.signal.aborted) setReview(value)
    } catch { if (!lifetime.current.signal.aborted) setError(true) }
    finally { if (!lifetime.current.signal.aborted) setBusy(false) }
  }
  const create = async () => {
    if (!review || !confirmed || busy) return
    setBusy(true); setError(false)
    try {
      const response = await fetch('/api/enterprise/sites?action=company-create', { method: 'POST', signal: lifetime.current.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ digest: review.digest, style, confirmed: true }) })
      if (!response.ok) { setConfirmed(false); throw new Error('create') }
      const site = z.object({ id: z.string(), name: z.string(), currentRevisionId: z.string().optional() }).parse(await response.json())
      if (!lifetime.current.signal.aborted) created(site)
    } catch { if (!lifetime.current.signal.aborted) setError(true) }
    finally { if (!lifetime.current.signal.aborted) setBusy(false) }
  }
  const content = review?.content
  return <article className="site-starter"><h3>{t('companyTitle')}</h3><p>{t('companyDetail')}</p><Button disabled={busy} onClick={() => { void load() }}>{t('companyReview')}</Button>
    {error && <p role="alert">{t('companyError')}</p>}
    {review?.issues.map(issue => <p key={issue} role="status">{t(issue === 'profileMissing' ? 'companyMissing' : issue === 'productExcluded' ? 'companyExcluded' : issue === 'productsMissing' ? 'companyProductsMissing' : 'companyError')}</p>)}
    {content && <div className="site-company-review"><h4>{content.name}</h4><p>{content.description}</p><p>{content.business}</p><p>{[content.email, content.phone, content.address].filter(Boolean).join(' · ')}</p>
      {content.products.map(product => <details key={product.slug}><summary>{product.name}</summary><p>{product.description}</p><ul>{product.applications.map((value, index) => <li key={index}>{value}</li>)}</ul><dl>{product.specifications.map((fact, index) => <div key={index}><dt>{fact.name}</dt><dd>{fact.value}</dd></div>)}</dl></details>)}
      {content.qualifications.map((value, index) => <p key={index}>{value}</p>)}
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> {t('companyConfirm')}</label><p><Button variant="primary" disabled={busy || !confirmed} onClick={() => { void create() }}>{t('companyCreate')}</Button></p>
    </div>}
  </article>
}
