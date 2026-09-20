/** Focused editorial controls save through the company draft and review workflow. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { supplierKind } from './supplier.ts'
import type { SupplierGraph } from './supplier.ts'
import { kindLabels, SupplierField } from './supplier-editor.tsx'
import type { SupplierT } from './supplier-editor.tsx'
import { editableSupplierPresentation, resolveSupplierPresentation } from './supplier-presentation.ts'
import type { SupplierPresentation } from './supplier-presentation.ts'

/**
 * Edit focus, ordered home collections and featured objects in a detached draft.
 * @param props - Draft graph, company fallback title, locale and change callback.
 * @returns Live reading outline and bounded editorial controls.
 */
export function SupplierPresentationEditor({ graph, companyTitle, t, change }: { graph: SupplierGraph; companyTitle: string; t: SupplierT; change: (value: SupplierGraph) => void }) {
  const value = editableSupplierPresentation(graph)
  const plan = resolveSupplierPresentation(graph)
  const update = (patch: Partial<SupplierPresentation>) => change({ ...graph, presentation: { ...value, ...patch } })
  const move = <T,>(items: T[], index: number, delta: number): T[] => {
    const result = [...items]
    const next = index + delta
    const item = result[index]!
    result[index] = result[next]!
    result[next] = item
    return result
  }
  const sections = value.sections.length ? value.sections : plan.primary
  return <div className="sp-presentation-editor">
    <p className="sp-muted">{t('supplierPresentationHint')}</p>
    <div className="sp-focus-choices" role="group" aria-label={t('supplierFocus')}>
      {(['auto', 'products', 'services', 'projects'] as const).map(focus => <button type="button" key={focus} aria-pressed={value.focus === focus} onClick={() => update({ focus, sections: [] })}><strong>{t(({ auto: 'supplierFocusAuto', products: 'supplierFocusProducts', services: 'supplierFocusServices', projects: 'supplierFocusProjects' } as const)[focus])}</strong><span>{t(({ auto: 'supplierFocusAutoHint', products: 'supplierFocusProductsHint', services: 'supplierFocusServicesHint', projects: 'supplierFocusProjectsHint' } as const)[focus])}</span></button>)}
    </div>
    <section className="sp-plan-preview" aria-label={t('supplierPresentationPreview')}><span className="sp-kicker">{t('supplierPresentationPreview')}</span><h3>{plan.headline || companyTitle}</h3>{plan.introduction && <p>{plan.introduction}</p>}<ol>{plan.primary.map(kind => <li key={kind}><strong>{t(kindLabels[kind])}</strong><span>{plan.nodes.filter(node => node.kind === kind).slice(0, 2).map(node => node.title).join(' · ') || t('supplierSectionMissing')}</span></li>)}</ol></section>
    <details><summary>{t('supplierPresentationCopy')}</summary><SupplierField label={t('supplierPresentationHeadline')} value={value.headline} onChange={headline => update({ headline })} /><SupplierField label={t('supplierPresentationIntro')} value={value.introduction} multiline onChange={introduction => update({ introduction })} /></details>
    <details><summary>{t('supplierPresentationSections')}</summary><p className="sp-muted">{t('supplierSectionsHint')}</p>
      {sections.map((kind, index) => <div className="sp-plan-row" key={kind}><strong>{t(kindLabels[kind])}</strong><Button disabled={index === 0} aria-label={t('supplierMoveUp', { name: t(kindLabels[kind]) })} onClick={() => update({ sections: move(sections, index, -1) })}>{t('supplierUp')}</Button><Button disabled={index === sections.length - 1} aria-label={t('supplierMoveDown', { name: t(kindLabels[kind]) })} onClick={() => update({ sections: move(sections, index, 1) })}>{t('supplierDown')}</Button><Button disabled={sections.length === 1} aria-label={t('supplierFoldSection', { name: t(kindLabels[kind]) })} onClick={() => update({ sections: sections.filter(item => item !== kind) })}>{t('supplierFold')}</Button></div>)}
      <div className="ent-actions">{supplierKind.options.filter(kind => !sections.includes(kind)).map(kind => <Button key={kind} disabled={sections.length >= 3} onClick={() => update({ sections: [...sections, kind] })}>{t('supplierAddSection', { name: t(kindLabels[kind]) })}</Button>)}</div>
      <Button onClick={() => update({ sections: [] })}>{t('supplierAutoSections')}</Button>
    </details>
    <details><summary>{t('supplierFeatured')}</summary><p className="sp-muted">{t('supplierFeaturedHint')}</p>
      {value.featuredIds.map((id, index) => <div className="sp-plan-row" key={id}><strong>{graph.nodes.find(node => node.id === id)?.title}</strong><Button disabled={index === 0} aria-label={t('supplierMoveUp', { name: graph.nodes.find(node => node.id === id)?.title ?? '' })} onClick={() => update({ featuredIds: move(value.featuredIds, index, -1) })}>{t('supplierUp')}</Button><Button aria-label={t('supplierUnfeature', { name: graph.nodes.find(node => node.id === id)?.title ?? '' })} onClick={() => update({ featuredIds: value.featuredIds.filter(item => item !== id) })}>{t('supplierRemoveFeatured')}</Button></div>)}
      {graph.nodes.map(node => <label className="supplier-check" key={node.id}><input type="checkbox" checked={value.featuredIds.includes(node.id)} disabled={value.featuredIds.length >= 14 && !value.featuredIds.includes(node.id)} onChange={event => update({ featuredIds: event.target.checked ? [...value.featuredIds, node.id] : value.featuredIds.filter(id => id !== node.id) })} />{node.title}</label>)}
    </details>
    <Button onClick={() => { const { presentation: _presentation, ...rest } = graph; change(rest) }}>{t('supplierResetPresentation')}</Button>
  </div>
}
