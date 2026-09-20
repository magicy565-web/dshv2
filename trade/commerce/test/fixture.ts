/** Isolated business fixture; all companies, merchants and results are synthetic. */
import { randomUUID } from 'node:crypto'
import { CommerceDatabase } from '../src/database.ts'
import { CommerceService } from '../src/service.ts'
import { id } from '../src/schema.ts'
import type { Fact, Principal, Records } from '../src/schema.ts'

/** Allocate a test identity.
 * @returns A fresh opaque UUID.
 */
export const key = () => id.parse(randomUUID())
/** Build a draft fact without pretending it is verified.
 * @param value - Fixture value.
 * @returns Inferred or unknown fact.
 */
export const fact = (value: Fact['value']): Fact => ({ value, status: value === null ? 'UNKNOWN' : 'AI_INFERRED', visibility: 'CONFIDENTIAL', evidenceIds: [] })
/** Create an isolated service and role-scoped command helpers.
 * @param path - Private test database path or in-memory database.
 * @returns Business fixture, with close owned by the test.
 */
export function fixture(path = ':memory:') {
  const db = new CommerceDatabase(path)
  let now = '2026-09-21T08:00:00.000Z'
  const service = new CommerceService(db, () => now)
  const factory: Principal = { role: 'factory', subjectId: key() }, merchant: Principal = { role: 'merchant', subjectId: key() }
  const send = (actor: Principal, type: string, fields: object = {}) => service.execute(actor, { requestId: key(), type, ...fields })
  const confirm = (actor: Principal, kind: 'company' | 'passport' | 'merchantProfile', recordId = actor.subjectId) => {
    const r = db.require(kind, recordId)
    return send(actor, 'facts.confirm', { entityType: kind, id: r.id, expectedRevision: r.revision, fields: Object.entries(r.facts).filter(([, f]) => f.value !== null).map(([k]) => k), visibility: 'PUBLIC' })
  }
  const company = () => {
    send(factory, 'company.save', { id: factory.subjectId, expectedRevision: 0, facts: { legal_name: fact('Fixture Coffee Factory'), factory_status: fact(true), contacts: fact('fixture@example.test') } })
    confirm(factory, 'company')
  }
  const product = (complete = true) => {
    const productId = key()
    send(factory, 'product.save', { id: productId, expectedRevision: 0, facts: {
      'identity.product_name': fact('Fixture Ceramic Coffee Dripper'), 'identity.category': fact('Coffee accessories'), 'identity.manufacturer': fact('Fixture Coffee Factory'), 'specifications.technical_specs': fact('Ceramic; 250 g; 120 mm'), 'evidence.product_images': fact(['https://example.test/dripper.jpg']),
      'commercial.moq': fact(complete ? 30 : null), 'commercial.sample': fact(complete ? 'Sample available; request confirmed cost' : null), 'commercial.lead_time': fact(complete ? '25 days' : null), 'commercial.price_basis': fact(complete ? 'FOB confirmed unit cost' : null), 'commercial.currency': fact(complete ? 'USD' : null), 'commercial.cost': fact(complete ? 10 : null), 'customization.private_label': fact(complete ? true : null), 'fulfillment.shipping': fact(complete ? 'Ships from China; freight quoted separately' : null),
    } })
    confirm(factory, 'passport', productId)
    return productId
  }
  const opportunity = (productId: ReturnType<typeof key>) => {
    const r = send(factory, 'opportunity.build', { productId, targetMarket: 'United States', targetBrandTypes: ['Small coffee brand'], targetCustomerTypes: ['Coffee enthusiasts'], suggestedRetailPrice: 50, currency: 'USD', launchRequirements: ['Confirm landed freight'] }) as Records['opportunity']
    return send(factory, 'opportunity.release', { id: r.id, expectedRevision: r.revision, available: true }) as Records['opportunity']
  }
  const profile = () => {
    send(merchant, 'merchant.save', { id: merchant.subjectId, expectedRevision: 0, name: 'Fixture Coffee Brand', facts: { name: fact('Fixture Coffee Brand'), market: fact('United States'), 'brand.audience': fact('Coffee enthusiasts'), 'strategy.preferred_categories': fact(['Coffee accessories']), 'catalog.current_categories': fact(['Coffee beans']), 'strategy.max_moq': fact(50), 'strategy.currency': fact('USD'), 'brand.price_min': fact(40), 'brand.price_max': fact(120), 'strategy.target_margin': fact(50), 'strategy.private_label': fact(true) } })
    confirm(merchant, 'merchantProfile')
  }
  const matched = () => { company(); const p = product(); const o = opportunity(p); profile(); const matches = send(merchant, 'match.run') as Records['match'][]; return { productId: p, opportunity: o, match: matches[0]! } }
  const sample = (match: Records['match']) => send(merchant, 'sample.request', { matchId: match.id, variant: 'White ceramic', shippingAddress: 'Synthetic test address, not a shipping instruction' }) as Records['sample']
  const moveSample = (r: Records['sample'], status: Records['sample']['status']) => send(['CONFIRMED', 'SHIPPED'].includes(status) ? factory : merchant, 'sample.transition', { id: r.id, expectedRevision: r.revision, status, sampleCost: 15, shippingCost: 20, supplierResponse: 'Synthetic sample confirmation', tracking: 'fixture-tracking' }) as Records['sample']
  const prepare = () => {
    const { match } = matched(); let r = sample(match)
    for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'ACCEPTED'] as const) r = moveSample(r, status)
    return send(merchant, 'launch.prepare', { sampleId: r.id, targetPrice: 50, targetMargin: 50, initialInventoryModel: 'Small batch held by merchant' }) as Records['launch']
  }
  return { db, service, factory, merchant, send, confirm, company, product, opportunity, profile, matched, sample, moveSample, prepare, setTime(value: string) { now = value } }
}
