/** Custom domain review and provider-supplied DNS instructions in the Sites workspace. */
import { useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SiteHostingState } from './site-hosting-schema.ts'
import { siteDomainName, type SiteDomainName } from './site-domains-schema.ts'

type DomainChange = { operation: 'add' | 'remove' | 'verify'; name: SiteDomainName; expectedGeneration: number; confirmed: true }
type Props = PropsLocale<'sites'> & { state: SiteHostingState; disabled: boolean; change: (input: DomainChange) => Promise<void> }

/** Review hostname attachment/removal and show the DNS records required for verification.
 * @param props - Authorized hosting state, localized copy and the mutation action.
 * @returns A domain editor that never sends arbitrary provider project identifiers.
 */
export function SiteDomainsPanel({ state, disabled, change, t }: Props) {
  const [name, setName] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [review, setReview] = useState<DomainChange>()
  const propose = () => {
    const parsed = siteDomainName.safeParse(name)
    if (!parsed.success || parsed.data.endsWith('.vercel.app')) { setInvalid(true); return }
    setInvalid(false)
    setReview({ operation: 'add', name: parsed.data, expectedGeneration: state.generation, confirmed: true })
  }
  return <section className="site-domains" aria-label={t('domainsTitle')}>
    <h3>{t('domainsTitle')}</h3><p className="ent-muted">{t('domainsDetail')}</p>
    <form className="site-toolbar" onSubmit={event => { event.preventDefault(); propose() }}>
      <Input aria-label={t('domainName')} placeholder={t('domainPlaceholder')} value={name} onChange={event => { setName(event.target.value); setInvalid(false) }} />
      <Button type="submit" disabled={disabled || !state.projectId || !name.trim()}>{t('addDomain')}</Button>
    </form>
    {!state.projectId && <p>{t('domainNeedsProject')}</p>}
    {invalid && <p role="alert">{t('invalidDomain')}</p>}
    {state.pendingDomain && <p role="status">{t('domainPending')} <code>{state.pendingDomain.name}</code></p>}
    {review && <div className="site-publish-review" role="region" aria-label={t('domainReview')}>
      <h4>{t(review.operation === 'add' ? 'addDomain' : 'removeDomain')}</h4><strong>{review.name}</strong>
      <p>{t(review.operation === 'add' ? 'addDomainDetail' : 'removeDomainDetail')}</p>
      <div className="site-toolbar"><Button variant="primary" disabled={disabled} onClick={() => { const input = review; setReview(undefined); setName(''); void change(input) }}>{t('confirmDomainChange')}</Button><Button disabled={disabled} onClick={() => setReview(undefined)}>{t('cancelReview')}</Button></div>
    </div>}
    <div className="site-deployments">{(state.domains ?? []).map(domain => <article key={domain.name}>
      <div><strong>{domain.name}</strong>{domain.managed ? <span>{t('managedDomain')}</span> : <><span>{t(domain.verified ? 'domainVerified' : 'domainUnverified')}</span><span>{t(domain.configured ? 'dnsReady' : 'dnsPending')}</span></>}</div>
      {!domain.managed && <>
        {domain.dns.length > 0 && <details open={!domain.verified || !domain.configured} className="site-dns"><summary>{t('dnsRecords')}</summary><table>
          <thead><tr><th>{t('dnsType')}</th><th>{t('dnsName')}</th><th>{t('dnsValue')}</th><th>{t('dnsPurpose')}</th></tr></thead>
          <tbody>{domain.dns.map((record, index) => <tr key={index}><td>{record.type}</td><td><code>{record.name}</code></td><td><code>{record.value}</code></td><td>{t(record.purpose === 'ownership' ? 'dnsOwnership' : 'dnsRouting')}</td></tr>)}</tbody>
        </table></details>}
        <div className="site-toolbar"><Button disabled={disabled} onClick={() => { void change({ operation: 'verify', name: domain.name, expectedGeneration: state.generation, confirmed: true }) }}>{t('verifyDomain')}</Button><Button disabled={disabled} onClick={() => setReview({ operation: 'remove', name: domain.name, expectedGeneration: state.generation, confirmed: true })}>{t('removeDomain')}</Button></div>
      </>}
    </article>)}</div>
  </section>
}
