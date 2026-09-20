/** Private supplier capability graph, reviewed with its owning company GEO revision. */
import { z } from 'zod'

/** Graph-local business object identifier preserved in citations and relationships. */
export const supplierNodeId = z.string().trim().min(1).max(100).brand<'SupplierNodeId'>()
const nodeId = supplierNodeId
const evidenceId = z.string().trim().min(1).max(100).brand<'SupplierEvidenceId'>()
const text = z.string().trim().min(1).max(3000)
/** Procurement objects remain distinct from product catalog records. */
export const supplierKind = z.enum(['offering', 'solution', 'capability', 'value_proposition', 'case', 'partner_program', 'commercial_policy'])
const source = z.discriminatedUnion('type', [
  z.object({ type: z.literal('document'), fileId: z.string().uuid().brand<'EnterpriseFileId'>(), chunk: z.number().int().positive() }).strict(),
  z.object({ type: z.enum(['web', 'social']), uri: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)), publishedAt: z.iso.datetime().nullable() }).strict(),
  z.object({ type: z.literal('user'), statement: text }).strict(),
  z.object({ type: z.literal('asset'), fileId: z.string().uuid().brand<'EnterpriseFileId'>() }).strict(),
])
const evidence = z.object({ id: evidenceId, title: text, source, supports: text, limitations: text,
  category: z.enum(['document', 'certification', 'factory', 'customer', 'shipment', 'social', 'statement']).default('document'),
  confidence: z.enum(['unassessed', 'low', 'medium', 'high']).default('unassessed'),
  excerpt: z.string().max(5000).default(''),
}).strict()
const node = z.object({
  id: nodeId, kind: supplierKind, title: text, summary: text,
  productRecordId: z.string().uuid().brand<'GeoId'>().nullable(),
  buyerTypes: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  markets: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  businessModels: z.array(z.enum(['OEM', 'ODM', 'private_label', 'dropship', 'wholesale', 'distributor', 'service'])).max(7).default([]),
  level: z.enum(['category', 'family', 'product', 'variant']).nullable().default(null),
  disclosure: z.string().trim().max(1000).default(''),
  claims: z.array(z.object({
    attribute: z.string().trim().min(1).max(160), value: z.string().trim().max(1000),
    status: z.enum(['SELF_DECLARED', 'INFERRED', 'UNKNOWN', 'OUTDATED', 'CONFLICTED']),
    qualification: z.string().trim().max(1000), validUntil: z.iso.datetime().nullable(),
    evidenceIds: z.array(evidenceId).max(30),
  }).strict()).max(40),
}).strict()
/** Agent-authored graphs cannot grant verification; references must resolve within the graph. */
export const supplierGraph = z.object({
  presentation: z.object({
    focus: z.enum(['auto', 'products', 'services', 'projects']),
    headline: z.string().trim().max(160), introduction: z.string().trim().max(600),
    sections: z.array(supplierKind).max(3), featuredIds: z.array(nodeId).max(14),
  }).strict().describe('Revision-owned reading plan. Use source-backed concise copy, up to three home collections and existing node ids for featured entries. Empty sections select automatically; empty copy uses company fields.').optional(),
  nodes: z.array(node).max(100), evidence: z.array(evidence).max(100),
  relations: z.array(z.object({
    from: nodeId, to: nodeId,
    type: z.enum(['supports', 'applies_to', 'demonstrated_by', 'part_of']),
  }).strict()).max(200),
}).strict().superRefine((graph, ctx) => {
  const nodes = new Set(graph.nodes.map(item => item.id))
  const sources = new Set(graph.evidence.map(item => item.id))
  const invalid = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }
  if (nodes.size !== graph.nodes.length || sources.size !== graph.evidence.length) invalid('Supplier object and evidence ids must be unique')
  if (graph.presentation) {
    const { sections, featuredIds } = graph.presentation
    if (new Set(sections).size !== sections.length || new Set(featuredIds).size !== featuredIds.length) invalid('Presentation sections and featured ids must be unique')
    if (featuredIds.some(id => !nodes.has(id))) invalid('Presentation references a missing supplier object')
  }
  for (const item of graph.nodes) {
    if (item.productRecordId && item.kind !== 'offering') invalid('Only an offering can reference a catalog product')
    for (const claim of item.claims) {
      if (claim.status !== 'UNKNOWN' && (!claim.value || !claim.evidenceIds.length)) invalid('Known claims require a value and evidence')
      if (claim.evidenceIds.some(id => !sources.has(id))) invalid('Claim references missing evidence')
    }
  }
  for (const relation of graph.relations) {
    if (!nodes.has(relation.from) || !nodes.has(relation.to)) invalid('Relation references a missing supplier object')
  }
})
/** Graph content is private to the authenticated enterprise workspace. */
export type SupplierGraph = z.infer<typeof supplierGraph>
/** Literal retrieval filters; absence of a match is not proof of unavailable capability. */
export const supplierQuery = z.object({
  query: z.string().trim().min(1).max(200).optional(), kind: supplierKind.optional(),
  recordId: z.string().uuid().brand<'GeoId'>().optional(), nodeId: nodeId.optional(), offset: z.number().int().nonnegative().default(0),
}).strict()

/**
 * Find procurement objects without turning text similarity into a capability verdict.
 * @param graph - Human-confirmed company graph.
 * @param input - Optional literal keywords and object kind.
 * @param limit - Deployment-owned result bound.
 * @param now - Retrieval time used to mark expired claims.
 * @returns Bounded objects, their evidence, and incident relationships for nodeId traversal.
 */
export function querySupplier(graph: SupplierGraph, input: z.infer<typeof supplierQuery>, limit: number, now: Date) {
  const normalize = (value: string): string => value.normalize('NFKC').toLowerCase()
  const terms = input.query ? normalize(input.query).match(/[\p{L}\p{N}]+/gu) ?? [] : []
  const matches = graph.nodes
    .filter(item => !input.kind || item.kind === input.kind)
    .filter(item => !input.nodeId || item.id === input.nodeId)
    .map(item => {
      const content = normalize([item.title, item.summary, ...item.buyerTypes, ...item.markets, ...item.businessModels, ...item.claims.flatMap(claim => [claim.attribute, claim.value, claim.qualification])].join('\n'))
      return { item, score: terms.filter(term => content.includes(term)).length }
    })
    .filter(match => !input.query || match.score > 0)
    .sort((a, b) => b.score - a.score)
  const items = matches.slice(input.offset, input.offset + limit).map(({ item }) => ({
    ...item,
    claims: item.claims.map(claim => ({ ...claim, expired: claim.validUntil !== null && Date.parse(claim.validUntil) <= now.getTime() })),
  }))
  const ids = new Set(items.map(item => item.id))
  const evidenceIds = new Set(items.flatMap(item => item.claims.flatMap(claim => claim.evidenceIds)))
  return {
    items, total: matches.length, offset: input.offset, limit, hasMore: matches.length > input.offset + items.length,
    evidence: graph.evidence.filter(item => evidenceIds.has(item.id)),
    relations: graph.relations.filter(item => ids.has(item.from) || ids.has(item.to)),
  }
}
