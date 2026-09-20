/** Overseas-buyer opportunity board backed by enterprise records. */
import { useState } from 'react'
import { Button, Input, Modal, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnterpriseOpportunity, OpportunityCommand, OpportunityFields } from './opportunities-schema.ts'

type T = PropsLocale<'enterprise'>['t']
const statuses = ['lead', 'researching', 'qualified', 'contacted', 'negotiating', 'won', 'lost'] as const
const statusKey = { lead: 'opportunityLead', researching: 'opportunityResearching', qualified: 'opportunityQualified', contacted: 'opportunityContacted', negotiating: 'opportunityNegotiating', won: 'opportunityWon', lost: 'opportunityLost' } as const

function fieldsOf(value: EnterpriseOpportunity): OpportunityFields {
  const { buyerName, buyerWebsite, country, targetProduct, contactName, contactRole, contactEmail, summary, matchScore, matchRationale, procurementSignals, evidence, status, nextAction, lastContactAt } = value
  return { buyerName, buyerWebsite, country, targetProduct, contactName, contactRole, contactEmail, summary, matchScore, matchRationale, procurementSignals, evidence, status, nextAction, lastContactAt }
}

/**
 * Render saved opportunities and allow stage changes with optimistic concurrency.
 * @param props - Opportunity records, localized copy, mutations, and research launcher.
 * @returns Opportunity dashboard.
 */
export function OpportunityPanel({ opportunities, busy, t, command, research }: { opportunities: EnterpriseOpportunity[]; busy: boolean; t: T; command: (value: OpportunityCommand) => Promise<boolean>; research: () => void }) {
  const [status, setStatus] = useState<'all' | EnterpriseOpportunity['status']>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<EnterpriseOpportunity | null>(null)
  const [archived, setArchived] = useState(false)
  const visible = opportunities.filter(item => item.archived === archived && (status === 'all' || item.status === status) && `${item.buyerName} ${item.country} ${item.targetProduct}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <div>
    <div className="ent-toolbar">
      <Button variant="primary" disabled={busy} onClick={research}>{t('opportunityResearch')}</Button>
      <Input icon={<IconSearchOutline16 />} aria-label={t('opportunitySearch')} placeholder={t('opportunitySearch')} value={search} onChange={event => setSearch(event.target.value)} />
      <label><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> {t('opportunityShowArchived')}</label>
    </div>
    <div className="ent-filters" style={{ marginBottom: 20 }}>{(['all', ...statuses] as const).map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === 'all' ? t('all') : t(statusKey[value])}</button>)}</div>
    {!visible.length && <p className="ent-empty">{t('opportunityEmpty')}</p>}
    <div className="ent-opportunity-grid">{visible.map(item => <article className="ent-opportunity-card" key={item.id}>
      <div className="ent-opportunity-heading"><div><h3>{item.buyerName}</h3><p className="ent-muted">{item.country} · {item.targetProduct}</p></div><strong>{item.matchScore}</strong></div>
      <p>{item.summary}</p>
      <p className="ent-muted">{t('opportunityEvidenceCount', { n: item.evidence.length })} · {t('opportunityRevision', { n: item.revision })}</p>
      <p><strong>{t('opportunityNextAction')}:</strong> {item.nextAction || t('notSet')}</p>
      <div className="ent-actions">
        <select aria-label={`${t('opportunityStatus')} ${item.buyerName}`} value={item.status} disabled={busy || item.archived} onChange={event => { void command({ action: 'update', id: item.id, expectedRevision: item.revision, fields: { ...fieldsOf(item), status: event.target.value as OpportunityFields['status'] } }) }}>{statuses.map(value => <option key={value} value={value}>{t(statusKey[value])}</option>)}</select>
        <Button disabled={busy} onClick={() => setSelected(item)}>{t('opportunityDetails')}</Button>
        <Button disabled={busy} onClick={() => { void command({ action: 'archive', id: item.id, expectedRevision: item.revision, archived: !item.archived }) }}>{t(item.archived ? 'taskRestore' : 'taskArchive')}</Button>
      </div>
    </article>)}</div>
    <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected?.buyerName ?? t('opportunityDetails')} closeLabel={t('close')} className="ent-dialog">
      {selected && <div className="ent-opportunity-detail">
        <p><strong>{t('opportunityMatch')}:</strong> {selected.matchScore}/100</p><p>{selected.matchRationale}</p>
        <h3>{t('opportunitySignals')}</h3>{selected.procurementSignals.length ? <ul>{selected.procurementSignals.map((signal, index) => <li key={index}>{signal}</li>)}</ul> : <p>{t('notSet')}</p>}
        <h3>{t('opportunityEvidence')}</h3>{selected.evidence.length ? <ul>{selected.evidence.map((item, index) => <li key={index}><a href={item.uri} target="_blank" rel="noreferrer">{item.label}</a><p>{item.note}</p><small>{new Date(item.observedAt).toLocaleString()}</small></li>)}</ul> : <p>{t('notSet')}</p>}
        <h3>{t('opportunityContact')}</h3><p>{[selected.contactName, selected.contactRole, selected.contactEmail].filter(Boolean).join(' · ') || t('notSet')}</p>
      </div>}
    </Modal>
  </div>
}
