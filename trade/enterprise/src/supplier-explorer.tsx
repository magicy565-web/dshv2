/** Readable supplier collections with contextual evidence and item-level actions. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Asset } from './schema.ts'
import type { SupplierGraph } from './supplier.ts'
import { supplierKind } from './supplier.ts'
import { kindLabels, relationLabels, sourceLabels, statusLabels } from './supplier-editor.tsx'
import type { SupplierT } from './supplier-editor.tsx'

import { ProfileIcon } from './profile-icons.tsx'
import { SupplierDialog } from './supplier-dialog.tsx'
import { ProfileMedia } from './profile-media.tsx'
import { resolveSupplierPresentation } from './supplier-presentation.ts'

type Node = SupplierGraph['nodes'][number]
type Evidence = SupplierGraph['evidence'][number]

/**
 * Browse saved business content; details never mutate the selected revision.
 * @param props - Saved graph, file metadata and explicit edit, source and chat actions.
 * @returns Searchable collections and an accessible detail dialog.
 */
export function SupplierExplorer({ graph, files, media, chooseImage, t, read, edit, ask, busy }: {
  graph: SupplierGraph; files: Asset[]; media: Record<Node['id'], Asset['id']>; chooseImage: (id: Node['id']) => void; t: SupplierT; read: (fileId: string, chunk: number) => void;
  edit: (nodeId?: string) => void; ask: (title: string) => void; busy: boolean;
}) {
  const [collection, setCollection] = useState<string>('overview')
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const detail = graph.nodes.find(node => node.id === detailId)
  const query = search.trim().toLocaleLowerCase()
  const matches = (node: Node) => `${node.title} ${node.summary} ${node.buyerTypes.join(' ')} ${node.markets.join(' ')} ${node.claims.map(claim => `${claim.attribute} ${claim.value}`).join(' ')}`.toLocaleLowerCase().includes(query)
  const plan = resolveSupplierPresentation(graph)
  const nodes = plan.nodes.filter(matches)
  const evidenceFor = (node: Node) => graph.evidence.filter(item => node.claims.some(claim => claim.evidenceIds.includes(item.id)))
  const mediaFor = (node: Node) => files.find(file => file.id === media[node.id] && file.category === 'image') ?? evidenceFor(node).flatMap(item => {
    const source = item.source
    return source.type === 'asset' ? files.filter(file => file.id === source.fileId && file.category === 'image') : []
  })[0]
  const showCollection = (value: string) => { setCollection(value); setSearch('') }
  const source = (item: Evidence) => <article className="sp-source" key={item.id}>
    <div className="sp-source-heading"><span className="sp-kicker"><ProfileIcon name="commercial_policy" size={16} />{t(sourceLabels[item.source.type])}</span><h4>{item.title}</h4></div>
    <p>{item.supports}</p>
    {item.limitations && <p className="sp-muted">{t('supplierLimitations')}: {item.limitations}</p>}
    {item.excerpt && <blockquote>{item.excerpt}</blockquote>}
    {item.source.type === 'user' && <blockquote>{item.source.statement}</blockquote>}
    {item.source.type === 'document' && <Button disabled={busy} onClick={() => { if (item.source.type === 'document') { setDetailId(null); read(item.source.fileId, item.source.chunk) } }}>{t('supplierReadSource')}</Button>}
    {item.source.type === 'asset' && <a href={`/api/enterprise/file?id=${encodeURIComponent(item.source.fileId)}`} target="_blank" rel="noreferrer">{t('preview')} <ProfileIcon name="arrowUp" size={14} /></a>}
    {(item.source.type === 'web' || item.source.type === 'social') && <a href={item.source.uri} target="_blank" rel="noreferrer">{t('supplierUri')} <ProfileIcon name="arrowUp" size={14} /></a>}
    {(item.source.type === 'web' || item.source.type === 'social') && item.source.publishedAt && <time dateTime={item.source.publishedAt}>{item.source.publishedAt.slice(0, 10)}</time>}
    <small className="sp-muted">{t('supplierConfidence')}: {t(({ unassessed: 'supplierUnassessed', low: 'supplierLow', medium: 'supplierMedium', high: 'supplierHigh' } as const)[item.confidence])}</small>
  </article>
  const card = (node: Node) => {
    const asset = mediaFor(node)
    const visual = node.kind === 'offering' || node.kind === 'case' || node.kind === 'capability' || node.kind === 'solution'
    const service = node.kind === 'solution' || node.businessModels.includes('service')
    const imageLabel = node.kind === 'case' ? 'supplierCaseImage' : node.kind === 'capability' ? 'supplierCapabilityImage' : service ? 'supplierServiceImage' : 'supplierProductImage'
    const imageHint = node.kind === 'case' ? 'supplierCaseImageHint' : node.kind === 'capability' ? 'supplierCapabilityImageHint' : service ? 'supplierServiceImageHint' : 'supplierProductImageHint'
    return <article className={`sp-item sp-item-${node.kind}`} key={node.id}>
      {visual && <ProfileMedia asset={asset} label={t(imageLabel)} hint={t(imageHint)} t={t} choose={() => chooseImage(node.id)} />}
      <button type="button" className="sp-item-open" onClick={() => setDetailId(node.id)} aria-label={t('supplierOpenItem', { name: node.title })}><span><strong>{node.title}</strong><span className="sp-item-description">{node.summary}</span></span><ProfileIcon name="arrowUp" size={19} /></button>
    </article>
  }
  const groups = collection === 'overview' ? plan.primary : supplierKind.options.filter(kind => kind === collection)
  const group = (kind: Node['kind']) => {
    const items = nodes.filter(node => node.kind === kind)
    if (!items.length) return !query && collection === 'overview' && plan.primary.includes(kind) ? <section className="sp-group" key={kind}><h3>{t(kindLabels[kind])}</h3><div className="sp-section-placeholder"><p>{t('supplierSectionMissing')}</p><Button disabled={busy} onClick={() => ask(t(kindLabels[kind]))}>{t('supplierBuild')}</Button></div></section> : null
    const visible = collection === 'overview' && !query ? items.slice(0, 2) : items
    return <section className={`sp-group sp-group-${kind}`} key={kind}><div className="sp-section-heading"><h3>{t(kindLabels[kind])}</h3>{collection === 'overview' && items.length > 2 && <button type="button" onClick={() => showCollection(kind)}>{t('supplierViewAll')}<ProfileIcon name="arrow" size={15} /></button>}</div><div className={`sp-grid sp-grid-${kind}`}>{visible.map(card)}</div></section>
  }
  const visibleEvidence = graph.evidence.filter(item => `${item.title} ${item.supports} ${item.excerpt}`.toLocaleLowerCase().includes(query))
  return <div className={`sp-explorer sp-focus-${plan.focus}`}>
    <div className="sp-browse-bar"><nav className="sp-collections" aria-label={t('supplierBrowse')}>
      <button type="button" aria-pressed={collection === 'overview'} onClick={() => showCollection('overview')}><ProfileIcon name="overview" size={17} />{t('supplierOverview')}</button>
      {plan.collections.map(kind => <button type="button" key={kind} aria-pressed={collection === kind} onClick={() => showCollection(kind)}><ProfileIcon name={kind} size={17} />{t(kindLabels[kind])}</button>)}
      <button type="button" aria-pressed={collection === 'evidence'} onClick={() => showCollection('evidence')}><ProfileIcon name="evidence" size={17} />{t('supplierEvidence')}<span>{graph.evidence.length}</span></button>
    </nav><label className="sp-search-wrap"><ProfileIcon name="search" size={17} /><input className="sp-search" type="search" value={search} onChange={event => setSearch(event.target.value)} aria-label={t('supplierSearch')} placeholder={t('supplierSearch')} /></label></div>
    <div className={`sp-editorial-layout${collection !== 'overview' || query ? ' sp-layout-focused' : ''}`}><div className="sp-main-content">
    {collection === 'evidence' ? <div className="sp-source-grid">{visibleEvidence.map(source)}</div> : <div className={collection === 'overview' && !query ? 'sp-overview-groups' : 'sp-filtered-groups'}>{groups.map(group)}{collection === 'overview' && plan.secondary.some(kind => nodes.some(node => node.kind === kind)) && <details className="sp-more-content" open={query ? true : undefined}><summary>{t('supplierMoreContent')}<ProfileIcon name="chevron" size={17} /></summary>{plan.secondary.map(group)}</details>}</div>}
    {(collection === 'evidence' ? !visibleEvidence.length : !nodes.some(node => collection === 'overview' || node.kind === collection)) && <div className="sp-empty"><span className="sp-empty-icon"><ProfileIcon name="offering" size={36} /></span><h3>{t(query ? 'noMatch' : 'supplierCollectionEmpty')}</h3><p>{t(query ? 'supplierSearchHint' : 'supplierEmpty')}</p>{query ? <Button onClick={() => setSearch('')}>{t('supplierClearSearch')}</Button> : <Button disabled={busy} onClick={() => ask(collection === 'overview' || collection === 'evidence' ? '' : t(kindLabels[collection as Node['kind']]))}>{t('supplierBuild')}</Button>}</div>}
    </div>

    </div>
    {detail && <SupplierDialog className="ent-dialog sp-detail" closeLabel={t('close')} title={detail.title} onClose={() => setDetailId(null)}>
      <div className="sp-detail-intro">{mediaFor(detail) && <img className="sp-detail-photo" src={`/api/enterprise/file?id=${encodeURIComponent(mediaFor(detail)!.id)}`} alt={mediaFor(detail)!.name} />}<span className="sp-kicker">{t(kindLabels[detail.kind])}</span><p>{detail.summary}</p><div className="sp-tags">{[...detail.buyerTypes, ...detail.markets, ...detail.businessModels].map((tag, index) => <span key={index}>{tag}</span>)}</div></div>
      {!!detail.claims.length && <section className="sp-detail-section"><h3>{t('supplierClaims')}</h3><dl>{detail.claims.map((claim, index) => <div className="sp-claim" key={index}><dt>{claim.attribute}</dt><dd><strong>{claim.value || t('supplierUnknown')}</strong><span className="sp-status">{t(statusLabels[claim.status])}</span>{claim.qualification && <p>{claim.qualification}</p>}{claim.validUntil && <time dateTime={claim.validUntil}>{t('supplierValidUntil', { date: claim.validUntil.slice(0, 10) })}</time>}<small>{claim.evidenceIds.map(id => graph.evidence.find(item => item.id === id)?.title).filter(Boolean).join(' · ')}</small></dd></div>)}</dl></section>}
      {detail.disclosure && <p className="sp-disclosure">{detail.disclosure}</p>}
      {!!evidenceFor(detail).length && <section className="sp-detail-section"><h3>{t('supplierSources')}</h3>{evidenceFor(detail).map(source)}</section>}
      {graph.relations.some(relation => relation.from === detail.id || relation.to === detail.id) && <section className="sp-detail-section"><h3>{t('supplierRelated')}</h3>{graph.relations.filter(relation => relation.from === detail.id || relation.to === detail.id).map((relation, index) => {
        const other = graph.nodes.find(node => node.id === (relation.from === detail.id ? relation.to : relation.from))
        return other && <button className="sp-related" type="button" key={index} onClick={() => setDetailId(other.id)}><span>{relation.from === detail.id ? t(relationLabels[relation.type]) : t('supplierLinkedFrom')}</span><strong>{other.title}</strong><ProfileIcon name="arrow" size={16} /></button>
      })}</section>}
      <div className="sp-detail-actions"><Button disabled={busy} variant="primary" onClick={() => { setDetailId(null); ask(detail.title) }}>{t('supplierAskUpdate')}</Button><Button disabled={busy} onClick={() => { setDetailId(null); edit(detail.id) }}>{t('supplierEditItem')}</Button></div>
    </SupplierDialog>}
  </div>
}
