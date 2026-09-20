/** Resolve a reading plan from business objects without inventing company facts. */
import type { SupplierGraph } from './supplier.ts'

type Kind = SupplierGraph['nodes'][number]['kind']
/** Revision-owned editorial choices; empty text and sections use the company data. */
export type SupplierPresentation = NonNullable<SupplierGraph['presentation']>

/**
 * Choose reading order from explicit preferences or structured business activity.
 * @param graph - Selected company revision, including optional editorial choices.
 * @returns Resolved focus, primary and secondary collections, and ordered objects.
 */
export function resolveSupplierPresentation(graph: SupplierGraph) {
  const count = (kind: Kind) => graph.nodes.filter(node => node.kind === kind).length
  const offerings = graph.nodes.filter(node => node.kind === 'offering')
  const goods = offerings.filter(node => !node.businessModels.includes('service')).length
  const services = graph.nodes.filter(node => node.businessModels.includes('service')).length
  const inferred = goods > 0 ? 'products' : services > 0 ? 'services' : count('case') > 0 ? 'projects' : count('solution') > 0 || count('capability') > 0 ? 'services' : 'products'
  const focus = graph.presentation && graph.presentation.focus !== 'auto' ? graph.presentation.focus : inferred
  const priorities: Record<typeof focus, Kind[]> = {
    products: ['offering', 'case', 'capability', 'solution', 'value_proposition', 'partner_program', 'commercial_policy'],
    services: ['solution', 'capability', 'case', 'offering', 'value_proposition', 'partner_program', 'commercial_policy'],
    projects: ['case', 'solution', 'capability', 'offering', 'value_proposition', 'partner_program', 'commercial_policy'],
  }
  const available = priorities[focus].filter(kind => count(kind) > 0)
  const primary = graph.presentation?.sections.length ? graph.presentation.sections : available.slice(0, 3)
  const secondary = available.filter(kind => !primary.includes(kind))
  const featured = graph.presentation?.featuredIds ?? []
  const rank = (id: SupplierGraph['nodes'][number]['id']) => {
    const index = featured.indexOf(id)
    return index < 0 ? featured.length : index
  }
  return {
    focus, primary, secondary,
    collections: [...primary.filter(kind => count(kind) > 0), ...secondary],
    nodes: [...graph.nodes].sort((a, b) => rank(a.id) - rank(b.id)),
    headline: graph.presentation?.headline ?? '', introduction: graph.presentation?.introduction ?? '',
  }
}

/**
 * Materialize the current reading order for explicit editing.
 * @param graph - Current company revision.
 * @returns Detached editable preferences with no synthesized marketing copy.
 */
export function editableSupplierPresentation(graph: SupplierGraph): SupplierPresentation {
  return structuredClone(graph.presentation ?? { focus: 'auto', headline: '', introduction: '', sections: [], featuredIds: [] })
}
