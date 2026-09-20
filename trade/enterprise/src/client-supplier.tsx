/** Procurement-first profile, reviewed editing, evidence, matching and request inbox. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { geoRecord } from './geo-schema.ts'
import { fileSchema } from './schema.ts'
import type { Profile } from './schema.ts'
import { supplierGraph, supplierKind } from './supplier.ts'
import type { SupplierGraph } from './supplier.ts'
import { procurementRecord, supplierAccess, supplierRevision } from './supplier-workspace.ts'
import { supplierMatchInput } from './supplier-matching.ts'
import { SupplierEditor, SupplierField, kindLabels, statusLabels, relationLabels, sourceLabels } from './supplier-editor.tsx'
import type { SupplierT } from './supplier-editor.tsx'
import type { EnterpriseKey } from './locales.ts'

const stateSchema = z.object({ records: z.array(geoRecord), products: z.array(z.object({ id: z.string(), name: z.string() })), files: z.array(fileSchema), access: supplierAccess.omit({ expectedRevision: true }).extend({ revision: z.number() }), externalEnabled: z.boolean(), requests: z.array(procurementRecord), receipts: z.array(supplierRevision.extend({ checkedAt: z.string(), actor: z.literal('human') })) })
type State = z.infer<typeof stateSchema>
type Record = z.infer<typeof geoRecord>
type Requirement = z.infer<typeof supplierMatchInput>['requirements'][number]
const matchSchema = z.object({ candidates: z.array(z.object({ nodeId: z.string(), title: z.string(), status: z.enum(['MATCH', 'POSSIBLE', 'NO_MATCH']), known: z.array(z.object({ attribute: z.string(), value: z.union([z.string(), z.number()]) })), unknown: z.array(z.object({ attribute: z.string(), value: z.union([z.string(), z.number()]) })), conflicts: z.array(z.object({ attribute: z.string(), value: z.union([z.string(), z.number()]) })) })) })
const requestLabels = { quote: 'supplierQuote', sample: 'supplierSample', specification: 'supplierSpecification', partnership: 'supplierPartnership', purchase_consultation: 'supplierPurchase' } as const
const requestStatus = { draft: 'supplierDraftLabel', submitted: 'supplierSubmitted', in_review: 'supplierInReview', closed: 'supplierClosed' } as const

function GraphView({ graph, t, filter = '', search = '', read }: { graph: SupplierGraph; t: SupplierT; filter?: string; search?: string; read?: (fileId: string, chunk: number) => void }) {
  const matches = (item: SupplierGraph['nodes'][number]) => (!filter || item.kind === filter) && `${item.title} ${item.summary} ${item.buyerTypes.join(' ')} ${item.markets.join(' ')}`.toLowerCase().includes(search.toLowerCase())
  return <div>{supplierKind.options.map(kind => {
    const nodes = graph.nodes.filter(item => item.kind === kind && matches(item))
    return nodes.length ? <section key={kind} className="ent-section"><h3>{t(kindLabels[kind])}</h3><div className="supplier-cards">{nodes.map(node => <article className="supplier-card" key={node.id}>
      <h4>{node.title}</h4><p>{node.summary}</p><div className="supplier-pills">{[...node.buyerTypes, ...node.markets, ...node.businessModels].map((value, index) => <span key={index}>{value}</span>)}</div>
      {node.disclosure && <p className="ent-muted">{node.disclosure}</p>}
      <dl>{node.claims.map((claim, index) => <div className="supplier-fact" key={index}><dt>{claim.attribute}</dt><dd>{claim.value || t('supplierUnknown')} <span className="supplier-badge">{t(statusLabels[claim.status])}</span>{claim.validUntil && <time dateTime={claim.validUntil}>{claim.validUntil.slice(0, 10)}</time>}{claim.qualification && <p>{claim.qualification}</p>}{claim.evidenceIds.map(id => <span className="ent-muted" key={id}>{graph.evidence.find(item => item.id === id)?.title} </span>)}</dd></div>)}</dl>
      {graph.relations.filter(relation => relation.from === node.id).map((relation, index) => <p className="ent-muted" key={index}>{t(relationLabels[relation.type])} → {graph.nodes.find(item => item.id === relation.to)?.title}</p>)}
    </article>)}</div></section> : null
  })}
  {!filter && <section className="ent-section"><h3>{t('supplierEvidence')}</h3><div className="supplier-cards">{[...graph.evidence].sort((a, b) => ('publishedAt' in b.source ? b.source.publishedAt ?? '' : '').localeCompare('publishedAt' in a.source ? a.source.publishedAt ?? '' : '')).map(item => <article className="supplier-card" key={item.id}>
    <h4>{item.title}</h4><p className="supplier-badge">{t(sourceLabels[item.source.type])}</p>
    <p>{t('supplierSupports')}: {item.supports}</p><p>{t('supplierLimitations')}: {item.limitations}</p>
    <p>{t('supplierConfidence')}: {t(({ unassessed: 'supplierUnassessed', low: 'supplierLow', medium: 'supplierMedium', high: 'supplierHigh' } as const)[item.confidence])}</p>
    {item.source.type === 'document' && read && <Button onClick={() => { if (item.source.type === 'document') read(item.source.fileId, item.source.chunk) }}>{t('supplierReadSource')}</Button>}
    {(item.source.type === 'web' || item.source.type === 'social') && <><a href={item.source.uri} target="_blank" rel="noreferrer">{t('supplierUri')}</a>{item.source.publishedAt && <time dateTime={item.source.publishedAt}>{item.source.publishedAt.slice(0, 10)}</time>}</>}
    {item.source.type === 'user' && <blockquote>{item.source.statement}</blockquote>}
    {item.excerpt && <blockquote>{item.excerpt}</blockquote>}
    {item.source.type === 'asset' && <a href={`/api/enterprise/file?id=${encodeURIComponent(item.source.fileId)}`} target="_blank" rel="noreferrer">{t('preview')}</a>}
  </article>)}</div></section>}
  </div>
}

/**
 * Render the complete enterprise procurement workflow using authenticated routes.
 * @param props - Existing company identity, typed locale and native chat entry.
 * @returns Supplier workspace with independent review and disclosure actions.
 */
export function SupplierPanel({ profile, t, generate }: { profile: Profile; t: SupplierT; generate: (prompt: string, newSession?: boolean) => Promise<boolean> }) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<EnterpriseKey | null>(null)
  const [editing, setEditing] = useState(false)
  const [graph, setGraph] = useState<SupplierGraph>({ nodes: [], evidence: [], relations: [] })
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)
  const [questions, setQuestions] = useState('')
  const [view, setView] = useState<'objects' | 'match' | 'inbox' | 'access'>('objects')
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const [review, setReview] = useState<{ record: Record; action: 'confirm' | 'verify' } | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [passage, setPassage] = useState<string | null>(null)
  const [requirements, setRequirements] = useState<Requirement[]>([{ attribute: '', operator: 'equals', value: '', unit: '', required: true }])
  const [matches, setMatches] = useState<z.infer<typeof matchSchema> | null>(null)
  const [request, setRequest] = useState<{ id: string; type: keyof typeof requestLabels; nodeIds: string[]; name: string; email: string; message: string } | null>(null)
  const [grants, setGrants] = useState<State['access'] | null>(null)
  const abort = useRef<AbortController | null>(null)
  const pending = useRef(false)
  const api = async (path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`/api/enterprise${path}`, { signal: abort.current?.signal ?? null, credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
    const value: unknown = await response.json()
    if (!response.ok) throw new Error(typeof value === 'object' && value !== null && 'error' in value ? String(value.error) : 'supplierError')
    return value
  }
  const load = async (): Promise<void> => { const value = stateSchema.parse(await api('/supplier')); if (abort.current?.signal.aborted) return; setState(value); setGrants(value.access); setMatches(null) }
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try { await action() }
    catch (cause) { if (!abort.current?.signal.aborted) setError(cause instanceof Error && ['supplierConflict', 'supplierMissing', 'supplierIncomplete'].includes(cause.message) ? cause.message as EnterpriseKey : 'supplierError') }
    finally { pending.current = false; if (!abort.current?.signal.aborted) setBusy(false) }
  }
  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    void (async () => {
      try { const value = stateSchema.parse(await api('/supplier')); if (!controller.signal.aborted) { setState(value); setGrants(value.access) } }
      catch { if (!controller.signal.aborted) setError('supplierError') }
      finally { if (!controller.signal.aborted) setBusy(false) }
    })()
    return () => controller.abort()
  }, [])
  const current = state?.records.filter(record => record.status === 'confirmed' && record.supplier && !state.records.some(other => other.supersedesId === record.id && other.status === 'confirmed')) ?? []
  const confirmed = current[0]
  const draft = state?.records.find(record => record.status === 'draft' && record.supplier)
  const selected = draft ?? confirmed
  const read = (fileId: string, chunk: number): void => { void run(async () => { const value = z.object({ citation: z.string(), content: z.string() }).parse(await api(`/supplier/document?fileId=${encodeURIComponent(fileId)}&chunk=${chunk}`)); setPassage(`${value.citation}\n\n${value.content}`) }) }
  const save = (): void => { void run(async () => {
    const supplier = supplierGraph.parse(graph)
    const base = editingRecord
    const fields = { kind: 'company', name: base?.name ?? profile.name, description: base?.description || profile.description || profile.name, questions, sections: base?.sections.length ? base.sections : [{ label: t('supplierTitle'), content: profile.description || profile.name, source: t('supplierUser') }], supplier }
    const result = geoRecord.parse(await api('/supplier/draft', { id: base?.status === 'draft' ? base.id : crypto.randomUUID(), expectedRevision: base?.status === 'draft' ? base.revision : 0, supersedesId: base?.status === 'confirmed' ? base.id : base?.supersedesId ?? null, fields }))
    setEditing(false); setEditingRecord(result); await load()
  }) }
  return <div className="supplier-panel" role="tabpanel">
    {error && <p role="alert" className="ent-notice">{t(error)}</p>}
    <section className="supplier-hero"><div><h2>{t('supplierHeadline')}</h2><p>{confirmed?.description || profile.business || t('supplierEmpty')}</p><div className="supplier-pills">{supplierKind.options.map(value => <button key={value} onClick={() => { setView('objects'); setKind(value) }}>{t(kindLabels[value])} · {confirmed?.supplier?.nodes.filter(node => node.kind === value).length ?? 0}</button>)}</div></div>
    <div className="ent-actions"><Button disabled={busy} onClick={() => { void generate(`/product-geo ${t('supplierBuildPrompt')}`, true) }}>{t('supplierBuild')}</Button><Button disabled={busy} onClick={() => { setEditingRecord(selected ?? null); setQuestions(selected?.questions ?? ''); setGraph(structuredClone(selected?.supplier ?? { nodes: [], evidence: [], relations: [] })); setEditing(true) }}>{t('supplierEdit')}</Button><Button disabled={busy} onClick={() => { void run(load) }}>{t('retry')}</Button></div></section>
    {selected && <p className="ent-muted">{t(selected.status === 'draft' ? 'supplierDraftLabel' : 'supplierConfirmed')} · {t('supplierRevision', { n: selected.revision })} · {t(state?.receipts.some(receipt => receipt.id === selected.id && receipt.revision === selected.revision) ? 'supplierAttested' : 'supplierUnverified')}</p>}
    {!editing && <div className="ent-actions">{draft && <Button disabled={busy} variant="primary" onClick={() => { setAcknowledged(false); setReview({ record: draft, action: 'confirm' }) }}>{t('supplierReview')}</Button>}{confirmed && <><Button disabled={busy} onClick={() => { setAcknowledged(false); setReview({ record: confirmed, action: 'verify' }) }}>{t('supplierVerify')}</Button><Button disabled={busy} onClick={() => setRequest({ id: crypto.randomUUID(), type: 'quote', nodeIds: [], name: '', email: '', message: '' })}>{t('supplierRequest')}</Button></>}</div>}
    {selected?.questions && !editing && <p className="ent-notice supplier-pre">{t('supplierQuestions')}: {selected.questions}</p>}
    {editing && state ? <><SupplierField label={t('supplierQuestions')} multiline value={questions} onChange={setQuestions} /><SupplierEditor graph={graph} change={setGraph} files={state.files} products={state.products} t={t} /><div className="supplier-sticky ent-actions"><Button variant="primary" disabled={busy} onClick={save}>{t('supplierDraft')}</Button><Button onClick={() => setEditing(false)} disabled={busy}>{t('cancel')}</Button></div></> : <>
      <nav className="ent-tabs">{Object.entries({ objects: 'supplierObjects', match: 'supplierMatch', inbox: 'supplierInbox', access: 'supplierAccess' } as const).map(([value, label]) => <button className="ent-tab" aria-pressed={view === value} key={value} onClick={() => setView(value as typeof view)}>{t(label)}</button>)}</nav>
      {view === 'objects' && <><div className="ent-toolbar"><select aria-label={t('supplierObjects')} value={kind} onChange={event => setKind(event.target.value)}><option value="">{t('all')}</option>{supplierKind.options.map(value => <option key={value} value={value}>{t(kindLabels[value])}</option>)}</select><input aria-label={t('supplierSearch')} placeholder={t('supplierSearch')} value={search} onChange={event => setSearch(event.target.value)} /></div>{selected?.supplier ? <GraphView graph={selected.supplier} t={t} filter={kind} search={search} read={read} /> : <p className="ent-empty">{t('supplierEmpty')}</p>}</>}
      {view === 'match' && <section className="ent-section"><h3>{t('supplierRequirement')}</h3><p>{t('supplierMatchNotice')}</p>{requirements.map((item, index) => {
        const update = (patch: Partial<Requirement>) => setRequirements(values => values.map((value, i) => i === index ? { ...value, ...patch } : value))
        return <div className="supplier-card ent-grid" key={index}><SupplierField label={t('supplierAttribute')} value={item.attribute} onChange={attribute => update({ attribute })} /><SupplierField label={t('supplierValueField')} value={String(item.value)} onChange={value => update({ value: typeof item.value === 'number' ? Number(value) : value })} />
          <label className="ent-field"><span>{t('supplierOperator')}</span><select value={item.operator} onChange={event => update({ operator: event.target.value as typeof item.operator })}>{Object.entries({ equals: 'supplierEquals', contains: 'supplierContains', at_least: 'supplierAtLeast', at_most: 'supplierAtMost' } as const).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><SupplierField label={t('supplierUnit')} value={item.unit} onChange={unit => update({ unit })} />
          <label><input type="checkbox" checked={typeof item.value === 'number'} onChange={event => update({ value: event.target.checked ? Number(item.value) || 0 : String(item.value) })} />{t('supplierNumeric')}</label><label><input type="checkbox" checked={item.required} onChange={event => update({ required: event.target.checked })} />{t('supplierRequired')}</label><Button disabled={requirements.length === 1} onClick={() => setRequirements(values => values.filter((_, i) => i !== index))}>{t('delete')}</Button></div>
      })}<div className="ent-actions"><Button onClick={() => setRequirements(values => [...values, { attribute: '', operator: 'equals', value: '', unit: '', required: true }])}>{t('supplierAddRequirement')}</Button><Button variant="primary" disabled={busy || !confirmed} onClick={() => { if (confirmed) void run(async () => setMatches(matchSchema.parse(await api('/supplier/match', { recordId: confirmed.id, requirements })))) }}>{t('supplierRunMatch')}</Button></div>
      {matches?.candidates.map(item => <article className="supplier-card" key={item.nodeId}><h4>{item.title}</h4><strong>{t(item.status === 'MATCH' ? 'supplierMatched' : item.status === 'NO_MATCH' ? 'supplierNoMatch' : 'supplierPossible')}</strong>{(['known', 'unknown', 'conflicts'] as const).map(key => <div key={key}><h5>{t(({ known: 'supplierKnown', unknown: 'supplierUnknowns', conflicts: 'supplierConflicts' } as const)[key])}</h5><ul>{item[key].map((fact, index) => <li key={index}>{fact.attribute}: {String(fact.value)}</li>)}</ul></div>)}<Button onClick={() => setRequest({ id: crypto.randomUUID(), type: item.status === 'MATCH' ? 'quote' : 'specification', nodeIds: [item.nodeId], name: '', email: '', message: requirements.map(value => `${value.attribute}: ${value.value} ${value.unit}`).join('\n') })}>{t('supplierRequest')}</Button></article>)}</section>}
      {view === 'inbox' && <section className="ent-section"><h3>{t('supplierInbox')}</h3>{!state?.requests.length && <p>{t('supplierNoResults')}</p>}{state?.requests.map(item => <article className="supplier-card" key={item.id}><h4>{t(requestLabels[item.type])} · {item.name}</h4><p>{item.email}</p><p className="supplier-pre">{item.message}</p><p>{t(requestStatus[item.status])}</p><p>{t('supplierRequestNotice')}</p><div className="ent-actions">{item.status !== 'closed' && <Button disabled={busy} onClick={() => { void run(async () => { await api('/supplier/request-status', { id: item.id, expectedRevision: item.revision, status: item.status === 'draft' ? 'submitted' : item.status === 'submitted' ? 'in_review' : 'closed' }); await load() }) }}>{t(item.status === 'draft' ? 'supplierSubmit' : item.status === 'submitted' ? 'supplierStartReview' : 'supplierCloseRequest')}</Button>}</div></article>)}</section>}
      {view === 'access' && grants && <section className="ent-section"><h3>{t('supplierAccess')}</h3><p>{t('supplierShareNotice')}</p><p>{t(state?.externalEnabled ? 'supplierKeyReady' : 'supplierKeyMissing')}</p><p>{t('supplierEndpoint')}: <code>{`${location.origin}/supplier/v1/manifest`}</code></p><fieldset><legend>{t('supplierConfirmed')}</legend>{current.map(item => <label className="supplier-check" key={item.id}><input type="checkbox" checked={grants.records.some(grant => grant.id === item.id && grant.revision === item.revision)} onChange={event => setGrants({ ...grants, records: event.target.checked ? [...grants.records.filter(grant => grant.id !== item.id), { id: item.id, revision: item.revision }] : grants.records.filter(grant => grant.id !== item.id) })} />{item.name} · {t('supplierRevision', { n: item.revision })}</label>)}</fieldset><fieldset><legend>{t('supplierDocument')}</legend>{state?.files.map(file => <label className="supplier-check" key={file.id}><input type="checkbox" checked={grants.documents.includes(file.id)} onChange={event => setGrants({ ...grants, documents: event.target.checked ? [...grants.documents, file.id] : grants.documents.filter(id => id !== file.id) })} />{file.name}</label>)}</fieldset><Button variant="primary" disabled={busy} onClick={() => { void run(async () => { await api('/supplier/access', { expectedRevision: grants.revision, records: grants.records.filter(grant => current.some(record => record.id === grant.id && record.revision === grant.revision)), documents: grants.documents.filter(id => state?.files.some(file => file.id === id)) }); await load() }) }}>{t('supplierShare')}</Button></section>}
    </>}
    {review && <Modal open closeLabel={t('close')} className="ent-dialog" title={t(review.action === 'confirm' ? 'supplierConfirmQuestion' : 'supplierVerify')} onClose={() => { if (!busy) setReview(null) }}><p>{t(review.action === 'confirm' ? 'supplierConfirmDetail' : 'supplierVerifyQuestion')}</p><div className="supplier-review">{review.record.supplier && <GraphView graph={review.record.supplier} t={t} read={read} />}</div><label className="supplier-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{t('supplierAcknowledge')}</label><Button disabled={!acknowledged || busy} variant="primary" onClick={() => { void run(async () => { await api(`/supplier/${review.action}`, { id: review.record.id, revision: review.record.revision }); setReview(null); await load() }) }}>{t('geoConfirm')}</Button></Modal>}
    {passage && <Modal open closeLabel={t('close')} className="ent-dialog" title={t('supplierRawDocument')} onClose={() => setPassage(null)}><pre className="supplier-pre">{passage}</pre></Modal>}
    {request && confirmed && <Modal open closeLabel={t('close')} className="ent-dialog" title={t('supplierRequest')} onClose={() => { if (!busy) setRequest(null) }}><form onSubmit={event => { event.preventDefault(); void run(async () => { await api('/supplier/requests', { ...request, recordId: confirmed.id, recordRevision: confirmed.revision }); setRequest(null); setView('inbox'); await load() }) }}><label className="ent-field"><span>{t('supplierRequest')}</span><select value={request.type} onChange={event => setRequest({ ...request, type: event.target.value as typeof request.type })}>{Object.entries(requestLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><SupplierField label={t('supplierRequestName')} value={request.name} onChange={name => setRequest({ ...request, name })} /><SupplierField type="email" label={t('supplierRequestEmail')} value={request.email} onChange={email => setRequest({ ...request, email })} /><SupplierField multiline label={t('supplierRequestMessage')} value={request.message} onChange={message => setRequest({ ...request, message })} /><p>{t('supplierRequestNotice')}</p><Button type="submit" variant="primary" disabled={busy}>{t('supplierPrepare')}</Button></form></Modal>}
  </div>
}

/** Responsive supplier cards, editor and review layout. */
export const supplierStyle = `
.supplier-panel{min-width:0}.supplier-hero{display:grid;gap:20px;padding:24px 0}.supplier-hero h2{font-size:28px;margin:0 0 12px}.supplier-pills{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.supplier-pills>span,.supplier-pills>button,.supplier-badge{border:1px solid var(--border-color,#ddd);border-radius:20px;padding:4px 10px;font-size:12px;background:transparent}.supplier-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px}.supplier-card{min-width:0;padding:18px;border:1px solid var(--border-color,#ddd);border-radius:12px;margin:12px 0;overflow-wrap:anywhere}.supplier-card h4{font-size:17px;margin:0 0 10px}.supplier-card p{margin:8px 0}.supplier-card fieldset{border:0;padding:8px 0}.supplier-fact{margin:12px 0}.supplier-fact dt{font-weight:600}.supplier-fact dd{margin:4px 0}.supplier-claim{padding:12px;border-top:1px solid var(--border-color,#ddd)}.supplier-check{display:block;margin:12px 0}.supplier-check input{margin-right:8px}.supplier-relation{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:12px 0}.supplier-review{max-height:55vh;overflow:auto}.supplier-pre{white-space:pre-wrap;overflow-wrap:anywhere}.supplier-sticky{position:sticky;bottom:0;padding:16px;background:var(--background-color,#fff);border-top:1px solid #ddd}.supplier-panel input:not([type=checkbox]),.supplier-panel select,.supplier-panel textarea{max-width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--border-color,#ccc);border-radius:6px;background:transparent;color:inherit}.supplier-panel time{display:block;font-size:12px}.supplier-panel fieldset{min-width:0}.supplier-panel code{overflow-wrap:anywhere}@media(max-width:600px){.supplier-hero{padding:12px 0}.supplier-hero h2{font-size:23px}.supplier-card{padding:12px}.supplier-panel .ent-actions{flex-wrap:wrap}}`
