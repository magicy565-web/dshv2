/** Explicit requirement comparisons preserve uncertainty and never infer facts from keyword similarity. */
import { z } from 'zod'
import { supplierNodeId } from './supplier.ts'
import type { SupplierGraph } from './supplier.ts'

/** Structured requirements are extracted by the calling Agent or entered by the buyer. */
export const supplierMatchInput = z.object({
  recordId: z.string().uuid(),
  nodeIds: z.array(supplierNodeId).max(100).default([]),
  requirements: z.array(z.object({
    attribute: z.string().trim().min(1).max(160),
    operator: z.enum(['equals', 'contains', 'at_least', 'at_most']),
    value: z.union([z.string().trim().min(1).max(1000), z.number().finite()]),
    unit: z.string().trim().max(40).default(''), required: z.boolean().default(true),
  }).strict()).min(1).max(30),
}).strict()
/** Caller-visible requirement comparison input. */
export type SupplierMatchInput = z.infer<typeof supplierMatchInput>
const normalized = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const canonicalAttribute = (value: string): string => {
  const key = normalized(value)
  const aliases: Record<string, string> = { '克重': 'weight', 'gsm': 'weight', 'fabric weight': 'weight', '材料': 'material', '材质': 'material', '起订量': 'moq', 'minimum order quantity': 'moq', '交期': 'lead time', '工艺': 'process', '幅宽': 'width', '面料宽度': 'width' }
  return aliases[key] ?? key
}
const canonicalUnit = (value: string): string => {
  const key = normalized(value)
  return ({ gsm: 'g/m²', 'g/m2': 'g/m²', '克/平方米': 'g/m²', 米: 'm', meters: 'm', metres: 'm', 天: 'days', day: 'days', 厘米: 'cm', 公斤: 'kg' } as Record<string, string>)[key] ?? key
}

/**
 * Compare each candidate independently against exact buyer requirements.
 * @param graph - Confirmed graph; claims are never pooled across products.
 * @param input - Explicit requirements and candidate ids.
 * @param attested - Whether the exact graph revision has a human source-check receipt.
 * @param availableEvidence - Evidence ids whose sources remain accessible.
 * @param now - Time used to reject expired facts.
 * @returns Per-candidate MATCH, POSSIBLE or NO_MATCH with known, unknown and conflicting requirements.
 */
export function matchSupplier(graph: SupplierGraph, input: SupplierMatchInput, attested: boolean, availableEvidence: Set<string>, now: Date) {
  return graph.nodes.filter(node => input.nodeIds.length ? input.nodeIds.includes(node.id) : ['offering', 'solution', 'capability'].includes(node.kind)).map(node => {
    const comparisons = input.requirements.map(requirement => {
      const claims = node.claims.filter(claim => canonicalAttribute(claim.attribute) === canonicalAttribute(requirement.attribute))
      const usable = claims.filter(claim => claim.status === 'SELF_DECLARED' && (!claim.validUntil || Date.parse(claim.validUntil) > now.getTime()) && claim.evidenceIds.some(id => availableEvidence.has(id)))
      const facts = usable.map(claim => {
        let matches: boolean | null = null
        if (typeof requirement.value === 'number') {
          const value = /^(-?\d+(?:\.\d+)?)\s*(.*?)$/.exec(claim.value)
          if (value && canonicalUnit(value[2] ?? '') === canonicalUnit(requirement.unit)) {
            const actual = Number(value[1])
            matches = requirement.operator === 'at_least' ? actual >= requirement.value : requirement.operator === 'at_most' ? actual <= requirement.value : requirement.operator === 'equals' ? actual === requirement.value : null
          }
        } else if (!requirement.unit && (requirement.operator === 'equals' || requirement.operator === 'contains')) {
          matches = requirement.operator === 'equals' ? normalized(claim.value) === normalized(requirement.value) : normalized(claim.value).includes(normalized(requirement.value))
        }
        return { value: claim.value, qualification: claim.qualification, evidenceIds: claim.evidenceIds, matches }
      })
      const conflict = claims.some(claim => claim.status === 'CONFLICTED') || (facts.some(fact => fact.matches === true) && facts.some(fact => fact.matches === false))
      const evaluable = attested && !conflict && facts.length > 0 && facts.every(fact => fact.matches !== null && !fact.qualification)
      const status = evaluable ? facts.every(fact => fact.matches) ? 'supported' : 'contradicted' : 'unknown'
      return { ...requirement, status, facts, reason: conflict ? 'conflicting_sources' : !attested ? 'source_check_required' : facts.some(fact => fact.qualification) ? 'qualification_requires_confirmation' : !evaluable ? 'missing_expired_or_uncomparable_fact' : 'exact_comparison' }
    })
    const required = comparisons.filter(item => item.required)
    const status = required.some(item => item.status === 'contradicted') ? 'NO_MATCH' : required.length > 0 && required.every(item => item.status === 'supported') ? 'MATCH' : 'POSSIBLE'
    return { nodeId: node.id, title: node.title, status, known: comparisons.filter(item => item.status === 'supported'), unknown: comparisons.filter(item => item.status === 'unknown'), conflicts: comparisons.filter(item => item.status === 'contradicted'), nextAction: status === 'NO_MATCH' ? 'review_alternatives' : status === 'MATCH' ? 'request_quote_or_sample' : 'request_specification_confirmation' }
  })
}
