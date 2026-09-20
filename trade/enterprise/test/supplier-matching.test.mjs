/** Exact comparisons must not substitute retrieval relevance for procurement suitability. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { supplierGraph } from '../src/supplier.ts'
import { matchSupplier, supplierMatchInput } from '../src/supplier-matching.ts'

const now = new Date('2026-09-20T00:00:00Z')
const id = '00000000-0000-4000-8000-000000000001'
const graph = () => supplierGraph.parse({ nodes: [{ id: 'fabric', kind: 'offering', title: 'Printed viscose', summary: 'Dress fabric', productRecordId: null, claims: [
  { attribute: 'material', value: 'viscose', status: 'SELF_DECLARED', qualification: '', validUntil: null, evidenceIds: ['catalog'] },
  { attribute: 'GSM', value: '130 g/m²', status: 'SELF_DECLARED', qualification: '', validUntil: null, evidenceIds: ['catalog'] },
] }], evidence: [{ id: 'catalog', title: 'Catalog', source: { type: 'user', statement: '130 g/m² viscose' }, supports: 'Construction', limitations: 'No current commercial terms.' }], relations: [] })
const requirements = (value = 130) => supplierMatchInput.parse({ recordId: id, requirements: [{ attribute: '克重', operator: 'equals', value, unit: 'gsm' }, { attribute: 'material', operator: 'equals', value: 'viscose' }] })
const evaluate = (value, input = requirements(), attested = true, available = new Set(['catalog'])) => matchSupplier(value, input, attested, available, now)[0]

test('requires source attestation and compares exact units and values', () => {
  assert.equal(evaluate(graph(), requirements(), false).status, 'POSSIBLE')
  assert.equal(evaluate(graph()).status, 'MATCH')
  assert.equal(evaluate(graph(), requirements(140)).status, 'NO_MATCH')
  assert.equal(evaluate(graph(), requirements(), true, new Set()).status, 'POSSIBLE')
  const differentUnit = requirements(); differentUnit.requirements[0].unit = 'kg'
  assert.equal(evaluate(graph(), differentUnit).status, 'POSSIBLE')
})

test('retains qualifications, expired facts and conflicting sources as unknown', () => {
  for (const change of [
    value => { value.nodes[0].claims[1].qualification = 'Only after sample approval' },
    value => { value.nodes[0].claims[1].validUntil = '2026-09-19T00:00:00Z' },
    value => { value.nodes[0].claims[1].status = 'CONFLICTED' },
    value => { value.nodes[0].claims[1].status = 'INFERRED' },
    value => { value.nodes[0].claims[1].value = '120–140 g/m²' },
    value => { value.nodes[0].claims.push({ ...value.nodes[0].claims[1], value: '140 g/m²' }) },
  ]) { const value = graph(); change(value); assert.equal(evaluate(value).status, 'POSSIBLE') }
})

test('never pools facts across products and excludes optional failures from required fit', () => {
  const value = graph()
  value.nodes.push({ ...value.nodes[0], id: 'other', claims: [value.nodes[0].claims[1]] })
  value.nodes[0].claims = [value.nodes[0].claims[0]]
  assert.ok(matchSupplier(value, requirements(), true, new Set(['catalog']), now).every(item => item.status === 'POSSIBLE'))
  const input = requirements(140); input.requirements[0].required = false
  assert.equal(evaluate(graph(), input).status, 'MATCH')
})

test('supports numeric minimum and maximum comparisons without coercing ambiguous units', () => {
  const input = requirements(125); input.requirements[0].operator = 'at_least'
  assert.equal(evaluate(graph(), input).status, 'MATCH')
  input.requirements[0].operator = 'at_most'
  assert.equal(evaluate(graph(), input).status, 'NO_MATCH')
})
