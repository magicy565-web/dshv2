/** Form editor for procurement objects, source evidence and typed relationships. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { supplierGraph, supplierKind, supplierNodeId } from './supplier.ts'
import type { SupplierGraph } from './supplier.ts'
import type { Asset } from './schema.ts'
import type { EnterpriseKey } from './locales.ts'

/** Supplier labels belong to the enterprise locale namespace. */
export type SupplierT = PropsLocale<'enterprise'>['t']
/** Display order follows the buyer's procurement questions. */
export const kindLabels: Record<SupplierGraph['nodes'][number]['kind'], EnterpriseKey> = { offering: 'supplierOffering', solution: 'supplierSolution', capability: 'supplierCapability', value_proposition: 'supplierValue', case: 'supplierCase', partner_program: 'supplierPartner', commercial_policy: 'supplierPolicy' }
/** Claim statuses are displayed without promoting declarations to verification. */
export const statusLabels: Record<SupplierGraph['nodes'][number]['claims'][number]['status'], EnterpriseKey> = { SELF_DECLARED: 'supplierDeclared', INFERRED: 'supplierInferred', UNKNOWN: 'supplierUnknown', OUTDATED: 'supplierOutdated', CONFLICTED: 'supplierConflicted' }
/** Relationship labels explain the direction of each graph link. */
export const relationLabels: Record<SupplierGraph['relations'][number]['type'], EnterpriseKey> = { supports: 'supplierSupportsRelation', applies_to: 'supplierApplies', demonstrated_by: 'supplierDemonstrates', part_of: 'supplierPartOf' }
/** Source type labels keep social observations separate from document facts. */
export const sourceLabels = { document: 'supplierDocument', user: 'supplierUser', web: 'supplierWeb', social: 'supplierSocial', asset: 'assets' } as const
/** Reusable labeled controlled input.
 * @param props - Display label, value and edit callback.
 * @returns Accessible field.
 */
export function SupplierField({ label, value, onChange, multiline = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string }) {
  return <label className="ent-field"><span>{label}</span>{multiline ? <textarea aria-label={label} value={value} onChange={event => onChange(event.target.value)} /> : <input aria-label={label} type={type} value={value} onChange={event => onChange(event.target.value)} />}</label>
}
const split = (value: string): string[] => value === '' ? [] : value.split(/[,，]/)

/**
 * Edit one detached graph; saving and confirmation remain separate parent actions.
 * @param props - Current graph, products, documents, locale and update callback.
 * @returns Structured controls without JSON editing.
 */
export function SupplierEditor({ graph, change, files, products, t, initialNodeId }: { graph: SupplierGraph; change: (graph: SupplierGraph) => void; files: Asset[]; products: Array<{ id: string; name: string }>; t: SupplierT; initialNodeId?: string | undefined }) {
  const [section, setSection] = useState<'nodes' | 'evidence' | 'relations'>('nodes')
  const [nodeId, setNodeId] = useState(initialNodeId ?? graph.nodes[0]?.id)
  const [evidenceId, setEvidenceId] = useState<string | undefined>(graph.evidence[0]?.id)
  const activeNode = graph.nodes.find(item => item.id === nodeId)?.id ?? graph.nodes[0]?.id
  const activeEvidence = graph.evidence.find(item => item.id === evidenceId)?.id ?? graph.evidence[0]?.id
  const addNode = () => {
    const id = supplierNodeId.parse(crypto.randomUUID())
    change({ ...graph, nodes: [...graph.nodes, { id, kind: 'offering', title: t('supplierOffering'), summary: '', productRecordId: null, buyerTypes: [], markets: [], businessModels: [], level: null, disclosure: '', claims: [] }] })
    setNodeId(id)
  }
  const addEvidence = () => {
    const id = supplierGraph.shape.evidence.element.shape.id.parse(crypto.randomUUID())
    change({ ...graph, evidence: [...graph.evidence, { id, title: '', source: { type: 'user', statement: '' }, supports: '', limitations: '', category: 'statement', confidence: 'unassessed', excerpt: '' }] })
    setEvidenceId(id)
  }
  const node = (index: number, patch: Partial<SupplierGraph['nodes'][number]>) => change({ ...graph, nodes: graph.nodes.map((item, i) => i === index ? { ...item, ...patch } : item) })
  const evidence = (index: number, patch: Partial<SupplierGraph['evidence'][number]>) => change({ ...graph, evidence: graph.evidence.map((item, i) => i === index ? { ...item, ...patch } : item) })
  return <div className="supplier-editor">
    <nav className="sp-editor-tabs" aria-label={t('supplierMaintain')}>{(['nodes', 'evidence', 'relations'] as const).map(value => <button type="button" key={value} aria-pressed={section === value} onClick={() => setSection(value)}>{t(({ nodes: 'supplierEditorObjects', evidence: 'supplierEditorEvidence', relations: 'supplierEditorRelations' } as const)[value])}</button>)}</nav>
    <div className="sp-editor-layout"><nav className="sp-editor-nav" aria-label={t('supplierEditItem')}>
      {section === 'nodes' && <>{graph.nodes.map(item => <button type="button" key={item.id} aria-pressed={item.id === activeNode} onClick={() => setNodeId(item.id)}>{item.title || t(kindLabels[item.kind])}</button>)}<button type="button" onClick={addNode}>+ {t('supplierAdd')}</button></>}
      {section === 'evidence' && <>{graph.evidence.map(item => <button type="button" key={item.id} aria-pressed={item.id === activeEvidence} onClick={() => setEvidenceId(item.id)}>{item.title || t('supplierEvidence')}</button>)}<button type="button" onClick={addEvidence}>+ {t('supplierAddEvidence')}</button></>}
      {section === 'relations' && <p className="sp-muted">{t('supplierRelations')}</p>}
    </nav><div>
    {section === 'nodes' && <section className="ent-section">
      {graph.nodes.map((item, index) => item.id === activeNode && <fieldset className="supplier-card" key={item.id}><legend>{item.title || t(kindLabels[item.kind])}</legend>
        <div className="ent-grid"><label className="ent-field"><span>{t('supplierObjects')}</span><select value={item.kind} onChange={event => node(index, { kind: event.target.value as typeof item.kind, productRecordId: null })}>{supplierKind.options.map(kind => <option value={kind} key={kind}>{t(kindLabels[kind])}</option>)}</select></label>
          <SupplierField label={t('supplierNodeTitle')} value={item.title} onChange={title => node(index, { title })} />
          <SupplierField label={t('supplierSummary')} value={item.summary} multiline onChange={summary => node(index, { summary })} />
        </div><details><summary>{t('supplierEditMore')}</summary><div className="ent-grid">
          <SupplierField label={t('supplierBuyerTypes')} value={item.buyerTypes.join(',')} onChange={value => node(index, { buyerTypes: split(value) })} />
          <SupplierField label={t('supplierMarkets')} value={item.markets.join(',')} onChange={value => node(index, { markets: split(value) })} />
          <SupplierField label={t('supplierDisclosure')} value={item.disclosure} onChange={disclosure => node(index, { disclosure })} />
          {item.kind === 'offering' && <><label className="ent-field"><span>{t('supplierLevel')}</span><select value={item.level ?? ''} onChange={event => node(index, { level: (event.target.value || null) as typeof item.level })}><option value="">{t('supplierNone')}</option>{Object.entries({ category: 'supplierCategory', family: 'supplierFamily', product: 'supplierProductLevel', variant: 'supplierVariant' } as const).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
          <label className="ent-field"><span>{t('supplierProduct')}</span><select value={item.productRecordId ?? ''} onChange={event => node(index, { productRecordId: event.target.value ? supplierGraph.shape.nodes.element.shape.productRecordId.parse(event.target.value) : null })}><option value="">{t('supplierNone')}</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label></>}
        </div>
        <fieldset><legend>{t('supplierModels')}</legend><div className="supplier-pills">{supplierGraph.shape.nodes.element.shape.businessModels.unwrap().element.options.map(model => <label key={model}><input type="checkbox" checked={item.businessModels.includes(model)} onChange={event => node(index, { businessModels: event.target.checked ? [...item.businessModels, model] : item.businessModels.filter(value => value !== model) })} />{model}</label>)}</div></fieldset>
        </details><details><summary>{t('supplierEditClaims')} · {item.claims.length}</summary>{item.claims.map((claim, claimIndex) => {
          const update = (patch: Partial<typeof claim>) => node(index, { claims: item.claims.map((value, i) => i === claimIndex ? { ...value, ...patch } : value) })
          return <div className="supplier-claim" key={claimIndex}><div className="ent-grid">
            <SupplierField label={t('supplierAttribute')} value={claim.attribute} onChange={attribute => update({ attribute })} />
            <SupplierField label={t('supplierValueField')} value={claim.value} onChange={value => update({ value })} />
            <label className="ent-field"><span>{t('supplierClaims')}</span><select value={claim.status} onChange={event => update({ status: event.target.value as typeof claim.status })}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></label>
            <SupplierField label={t('supplierQualification')} value={claim.qualification} onChange={qualification => update({ qualification })} />
            <SupplierField label={t('supplierExpiry')} value={claim.validUntil ?? ''} onChange={validUntil => update({ validUntil: validUntil || null })} />
          </div><fieldset><legend>{t('supplierSources')}</legend>{graph.evidence.map(source => <label className="supplier-check" key={source.id}><input type="checkbox" checked={claim.evidenceIds.includes(source.id)} onChange={event => update({ evidenceIds: event.target.checked ? [...claim.evidenceIds, source.id] : claim.evidenceIds.filter(id => id !== source.id) })} />{source.title}</label>)}</fieldset>
          <Button onClick={() => node(index, { claims: item.claims.filter((_, i) => i !== claimIndex) })}>{t('delete')}</Button></div>
        })}<div className="ent-actions"><Button onClick={() => node(index, { claims: [...item.claims, { attribute: '', value: '', status: 'UNKNOWN', qualification: '', validUntil: null, evidenceIds: [] }] })}>{t('supplierAddClaim')}</Button>
        </div></details><Button onClick={() => change({ ...graph, ...(graph.presentation ? { presentation: { ...graph.presentation, featuredIds: graph.presentation.featuredIds.filter(id => id !== item.id) } } : {}), nodes: graph.nodes.filter(value => value.id !== item.id), relations: graph.relations.filter(value => value.from !== item.id && value.to !== item.id) })}>{t('delete')}</Button>
      </fieldset>)}
    </section>}
    {section === 'evidence' && <section className="ent-section">{graph.evidence.map((item, index) => item.id === activeEvidence && <fieldset key={item.id} className="supplier-card"><legend>{item.title || t('supplierEvidence')}</legend><div className="ent-grid">
      <SupplierField label={t('supplierNodeTitle')} value={item.title} onChange={title => evidence(index, { title })} />
      <label className="ent-field"><span>{t('supplierSourceType')}</span><select value={item.source.type} onChange={event => {
        const type = event.target.value as typeof item.source.type
        const file = type === 'asset' ? files[0] : files.find(file => file.knowledgeStatus === 'ready')
        if ((type === 'document' || type === 'asset') && !file) return
        const source = type === 'asset' && file ? { type, fileId: file.id } : type === 'document' && file ? { type, fileId: file.id, chunk: 1 } : type === 'web' || type === 'social' ? { type, uri: '', publishedAt: null } : { type: 'user' as const, statement: '' }
        evidence(index, { source })
      }}>{Object.entries(sourceLabels).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></label>
      {item.source.type === 'document' && <><label className="ent-field"><span>{t('supplierDocument')}</span><select value={item.source.fileId} onChange={event => evidence(index, { source: { type: 'document', fileId: supplierGraph.shape.evidence.element.shape.source.options[0].shape.fileId.parse(event.target.value), chunk: item.source.type === 'document' ? item.source.chunk : 1 } })}><option value="">{t('supplierNone')}</option>{files.filter(file => file.knowledgeStatus === 'ready').map(file => <option value={file.id} key={file.id}>{file.name}</option>)}</select></label><SupplierField type="number" label={t('supplierChunk')} value={String(item.source.chunk)} onChange={value => { if (item.source.type === 'document') evidence(index, { source: { ...item.source, chunk: Number(value) } }) }} /></>}
      {item.source.type === 'user' && <SupplierField multiline label={t('supplierStatement')} value={item.source.statement} onChange={statement => evidence(index, { source: { type: 'user', statement } })} />}
      {item.source.type === 'asset' && <label className="ent-field"><span>{t('assets')}</span><select value={item.source.fileId} onChange={event => evidence(index, { source: { type: 'asset', fileId: supplierGraph.shape.evidence.element.shape.source.options[0].shape.fileId.parse(event.target.value) } })}>{files.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label>}
      {(item.source.type === 'web' || item.source.type === 'social') && <><SupplierField label={t('supplierUri')} value={item.source.uri} onChange={uri => { if (item.source.type === 'web' || item.source.type === 'social') evidence(index, { source: { ...item.source, uri } }) }} /><SupplierField label={t('supplierPublished')} value={item.source.publishedAt ?? ''} onChange={value => { if (item.source.type === 'web' || item.source.type === 'social') evidence(index, { source: { ...item.source, publishedAt: value || null } }) }} /></>}
      <SupplierField label={t('supplierSupports')} value={item.supports} onChange={supports => evidence(index, { supports })} />
      <SupplierField label={t('supplierLimitations')} value={item.limitations} onChange={limitations => evidence(index, { limitations })} />
      <SupplierField multiline label={t('supplierRawDocument')} value={item.excerpt} onChange={excerpt => evidence(index, { excerpt })} />
      <label className="ent-field"><span>{t('supplierEvidenceCategory')}</span><select value={item.category} onChange={event => evidence(index, { category: event.target.value as typeof item.category })}>{Object.entries({ document: 'supplierDocument', certification: 'supplierCertification', factory: 'supplierFactory', customer: 'supplierCustomer', shipment: 'supplierShipment', social: 'supplierSocial', statement: 'supplierUser' } as const).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></label>
      <label className="ent-field"><span>{t('supplierConfidence')}</span><select value={item.confidence} onChange={event => evidence(index, { confidence: event.target.value as typeof item.confidence })}>{Object.entries({ unassessed: 'supplierUnassessed', low: 'supplierLow', medium: 'supplierMedium', high: 'supplierHigh' } as const).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></label>
    </div><Button onClick={() => change({ ...graph, evidence: graph.evidence.filter(value => value.id !== item.id), nodes: graph.nodes.map(value => ({ ...value, claims: value.claims.map(claim => ({ ...claim, evidenceIds: claim.evidenceIds.filter(id => id !== item.id) })) })) })}>{t('delete')}</Button></fieldset>)}
    </section>}
    {section === 'relations' && <section className="ent-section"><h3>{t('supplierRelations')}</h3>{graph.relations.map((relation, index) => <div className="supplier-relation" key={index}>
      {(['from', 'to'] as const).map(key => <label className="ent-field" key={key}><span>{t(key === 'from' ? 'supplierFrom' : 'supplierTo')}</span><select value={relation[key]} onChange={event => change({ ...graph, relations: graph.relations.map((value, i) => i === index ? { ...value, [key]: supplierNodeId.parse(event.target.value) } : value) })}>{graph.nodes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>)}
      <label className="ent-field"><span>{t('supplierRelations')}</span><select value={relation.type} onChange={event => change({ ...graph, relations: graph.relations.map((value, i) => i === index ? { ...value, type: event.target.value as typeof value.type } : value) })}>{Object.entries(relationLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      <Button onClick={() => change({ ...graph, relations: graph.relations.filter((_, i) => i !== index) })}>{t('delete')}</Button>
    </div>)}<Button disabled={graph.nodes.length < 2} onClick={() => { if (graph.nodes[0] && graph.nodes[1]) change({ ...graph, relations: [...graph.relations, { from: graph.nodes[0].id, to: graph.nodes[1].id, type: 'supports' }] }) }}>{t('supplierAddRelation')}</Button></section>}
  </div></div></div>
}
