/** Company-specific reading plans preserve source content and review-owned choices. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { supplierGraph } from '../src/supplier.ts'
import { resolveSupplierPresentation, editableSupplierPresentation } from '../src/supplier-presentation.ts'

const node = (id, kind, businessModels = []) => ({ id, kind, title: id, summary: `${id} from company records`, businessModels, productRecordId: null, claims: [] })
const graph = nodes => supplierGraph.parse({ nodes, evidence: [], relations: [] })

test('manufacturers, service companies and project portfolios produce different reading plans', () => {
  const samples = [
    { nodes: [node('mill', 'capability'), node('fabric', 'offering', ['OEM']), node('dress', 'case')], focus: 'products', primary: ['offering', 'case', 'capability'] },
    { nodes: [node('audit', 'offering', ['service']), node('launch', 'solution'), node('research', 'capability')], focus: 'services', primary: ['solution', 'capability', 'offering'] },
    { nodes: [node('craft', 'capability'), node('museum', 'case'), node('home', 'case')], focus: 'projects', primary: ['case', 'capability'] },
    { nodes: [node('terms', 'commercial_policy')], focus: 'products', primary: ['commercial_policy'] },
    { nodes: [], focus: 'products', primary: [] },
  ]
  for (const sample of samples) {
    const value = graph(sample.nodes)
    const before = structuredClone(value)
    const plan = resolveSupplierPresentation(value)
    assert.deepEqual({ focus: plan.focus, primary: plan.primary }, { focus: sample.focus, primary: sample.primary })
    assert.deepEqual(plan.collections, sample.primary)
    assert.equal(plan.headline, '')
    assert.deepEqual(value, before)
  }
})

test('editorial order and featured entries persist without dropping secondary content', () => {
  const value = graph([node('old', 'case'), node('recent', 'case'), node('hero', 'case'), node('product', 'offering'), node('policy', 'commercial_policy')])
  value.presentation = { focus: 'projects', headline: 'Spaces for everyday life', introduction: 'A studio portfolio.', sections: ['case', 'solution'], featuredIds: ['hero', 'recent'] }
  const parsed = supplierGraph.parse(JSON.parse(JSON.stringify(value)))
  const plan = resolveSupplierPresentation(parsed)
  assert.deepEqual(plan.primary, ['case', 'solution'])
  assert.deepEqual(plan.secondary, ['offering', 'commercial_policy'])
  assert.deepEqual(plan.collections, ['case', 'offering', 'commercial_policy'])
  assert.deepEqual(plan.nodes.filter(node => node.kind === 'case').slice(0, 2).map(node => node.id), ['hero', 'recent'])
  assert.equal(plan.nodes.length, value.nodes.length)
  assert.equal(plan.headline, value.presentation.headline)
  const editable = editableSupplierPresentation(value)
  editable.sections.reverse()
  assert.deepEqual(value.presentation.sections, ['case', 'solution'])
})

test('presentation parser rejects dangling, duplicate, oversized and unknown selections', () => {
  const value = graph([node('fabric', 'offering')])
  const presentation = { focus: 'auto', headline: '', introduction: '', sections: [], featuredIds: [] }
  for (const patch of [
    { featuredIds: ['missing'] }, { featuredIds: ['fabric', 'fabric'] },
    { sections: ['case', 'case'] }, { sections: ['case', 'solution', 'offering', 'capability'] },
    { sections: ['unknown'] }, { focus: 'unknown' }, { headline: 'x'.repeat(161) }, { introduction: 'x'.repeat(601) },
  ]) assert.equal(supplierGraph.safeParse({ ...value, presentation: { ...presentation, ...patch } }).success, false)
  assert.equal(supplierGraph.safeParse({ ...value, presentation }).success, true)
})
