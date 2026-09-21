/** Business commands own authorization, revisions, approvals and atomic audit writes. */
import { createHash } from 'node:crypto'
import { base, BusinessError, CommerceDatabase } from './database.ts'
import { commandSchema } from './schema.ts'
import type { Command, Fact, Id, Principal, Records } from './schema.ts'
import { readiness, supported } from './readiness.ts'
import { matchOpportunity } from './matching.ts'
import { launchKit } from './listing.ts'
import { executeIntake } from './intake.ts'

const human = (a: Principal) => !a.role.endsWith('-agent')
const factory = (a: Principal) => a.role.startsWith('factory')
const profileRequired = ['market', 'strategy.preferred_categories', 'brand.audience', 'strategy.max_moq', 'strategy.currency'] as const
function demand(condition: unknown, code = 'forbidden', status = 403): asserts condition { if (!condition) throw new BusinessError(code, status) }
const next = <T extends { revision: number; updatedAt: string }>(r: T, now: string): T => ({ ...r, revision: r.revision + 1, updatedAt: now })

/** Authenticated business service; provider side effects live outside database transactions. */
export class CommerceService {
  constructor(readonly store: CommerceDatabase, readonly clock: () => string = () => new Date().toISOString(), readonly matchLimit = 3) {}

  /** Return product readiness using current source validity.
   * @param productId - Product id.
   * @returns Status and missing fields.
   */
  readiness(productId: Id) {
    const p = this.store.require('product', productId), passport = this.store.require('passport', productId)
    return readiness(p, passport, this.store.require('company', p.companyId), this.store.list('evidence'), this.clock())
  }
  /** Project only currently sourced facts.
   * @param record - Fact-bearing record.
   * @param publicOnly - Whether disclosure must be PUBLIC.
   * @returns Evidence-backed facts.
   */
  facts(record: Records['passport'] | Records['merchantProfile'] | Records['company'], publicOnly = true): Record<string, Fact> {
    const evidence = this.store.list('evidence')
    return Object.fromEntries(Object.entries(record.facts).filter(([key, fact]) => (!publicOnly || fact.visibility === 'PUBLIC') && supported(fact, evidence, record.id, key, this.clock())))
  }
  /** Whether an opportunity can be recommended or used for a new sample.
   * @param opportunity - Persisted opportunity.
   * @returns Current publication and source validity.
   */
  available(opportunity: Records['opportunity']): boolean {
    return opportunity.status === 'AVAILABLE' && this.store.require('passport', opportunity.productId).revision === opportunity.passportRevision
      && this.store.require('company', opportunity.companyId).revision === opportunity.companyRevision && this.readiness(opportunity.productId).status === 'OPPORTUNITY_READY'
  }
  private own(kind: 'company' | 'passport' | 'merchantProfile', key: Id, actor: Principal) {
    const r = this.store.require(kind, key)
    const owner = kind === 'company' ? r.id : 'companyId' in r ? r.companyId : 'merchantId' in r ? r.merchantId : null
    demand(owner === actor.subjectId && (kind === 'merchantProfile' ? !factory(actor) : factory(actor)))
    return r
  }
  private draft(facts: Record<string, Fact>, kind: 'company' | 'passport' | 'merchantProfile', key: Id, actor: Principal) {
    for (const [field, fact] of Object.entries(facts)) {
      demand(['UNKNOWN', 'AI_INFERRED', 'CONFLICTING'].includes(fact.status), 'human_confirmation_required', 409)
      for (const evidenceId of fact.evidenceIds) {
        const e = this.store.require('evidence', evidenceId)
        demand(e.ownerId === actor.subjectId && e.entityType === kind && e.entityId === key && e.field === field && JSON.stringify(e.value) === JSON.stringify(fact.value), 'evidence_binding_invalid', 409)
      }
    }
  }
  private currentMatch(key: Id, actor: Principal) {
    const m = this.store.require('match', key)
    demand(!factory(actor) && m.merchantId === actor.subjectId)
    const o = this.store.require('opportunity', m.opportunityId)
    const profile = this.store.require('merchantProfile', actor.subjectId), facts = this.facts(profile, false)
    demand(this.available(o) && o.revision === m.opportunityRevision && profile.revision === m.profileRevision && profileRequired.every(k => facts[k]), 'match_stale', 409)
    return { m, o }
  }
  /** Execute one parsed wire command exactly once per authenticated subject and request id.
   * @param actor - Server-resolved identity.
   * @param input - Untrusted JSON command.
   * @returns Durable result; conflicting retries, revisions and permissions throw.
   */
  execute(actor: Principal, input: unknown): unknown {
    const c = commandSchema.parse(input), who = `${actor.role}:${actor.subjectId}`
    const digest = createHash('sha256').update(JSON.stringify(c)).digest('hex')
    return this.store.transaction(() => {
      const receipt = this.store.db.prepare('SELECT digest,result FROM receipts WHERE actor=? AND request_id=?').get(who, c.requestId)
      if (receipt) { demand(receipt.digest === digest, 'idempotency_conflict', 409); return JSON.parse(String(receipt.result)) as unknown }
      const result = this.command(actor, c)
      const now = this.clock()
      this.store.put('activity', { ...base(now), ownerId: actor.subjectId, actor: who, action: c.type, targetId: 'id' in c ? c.id : c.requestId, detail: '' })
      this.store.db.prepare('INSERT INTO receipts(actor,request_id,digest,result) VALUES(?,?,?,?)').run(who, c.requestId, digest, JSON.stringify(result))
      return result
    })
  }
  private command(a: Principal, c: Command): unknown {
    const s = this.store, now = this.clock()
    if (['company.save', 'product.save', 'merchant.save', 'facts.confirm', 'evidence.revoke', 'product.pause', 'opportunity.release'].includes(c.type)) {
      const publishing = s.list('approval').filter(r => ['EXECUTING', 'UNCERTAIN'].includes(r.status)).some(r => {
        const launch = s.require('launch', r.launchId), product = s.require('product', launch.productId)
        return a.subjectId === launch.merchantId || a.subjectId === product.companyId
      })
      demand(!publishing, 'publication_requires_reconciliation', 409)
    }
    switch (c.type) {
      case 'onboarding.start':
      case 'onboarding.source':
      case 'onboarding.company':
      case 'onboarding.products':
      case 'onboarding.submit':
        return executeIntake(this.store, a, c, now, command => this.command(a, command))
      case 'company.save': {
        demand(factory(a) && c.id === a.subjectId)
        const r = s.get('company', c.id)
        demand((r?.revision ?? 0) === c.expectedRevision, 'revision_conflict', 409)
        this.draft(c.facts, 'company', c.id, a)
        return s.put('company', { ...(r ? next(r, now) : base(now, c.id)), facts: { ...r?.facts, ...c.facts } })
      }
      case 'product.save': {
        demand(factory(a)); s.require('company', a.subjectId)
        const r = s.get('passport', c.id)
        if (r) demand(r.companyId === a.subjectId)
        demand((r?.revision ?? 0) === c.expectedRevision, 'revision_conflict', 409)
        this.draft(c.facts, 'passport', c.id, a)
        if (!r) s.put('product', { ...base(now, c.id), companyId: a.subjectId, paused: false })
        return s.put('passport', { ...(r ? next(r, now) : base(now, c.id)), companyId: a.subjectId, productId: c.id, facts: { ...r?.facts, ...c.facts } })
      }
      case 'merchant.save': {
        demand(!factory(a) && c.id === a.subjectId)
        const r = s.get('merchantProfile', c.id)
        demand((r?.revision ?? 0) === c.expectedRevision, 'revision_conflict', 409)
        this.draft(c.facts, 'merchantProfile', c.id, a)
        const merchant = s.get('merchant', c.id)
        s.put('merchant', { ...(merchant ? next(merchant, now) : base(now, c.id)), name: c.name })
        return s.put('merchantProfile', { ...(r ? next(r, now) : base(now, c.id)), merchantId: c.id, facts: { ...r?.facts, ...c.facts } })
      }
      case 'evidence.add': {
        const r = this.own(c.entityType, c.entityId, a)
        demand(Object.hasOwn(r.facts, c.field), 'field_missing', 409)
        demand(c.sourceType !== 'WEBSITE' || c.sourceUrl, 'source_url_required', 400)
        demand(c.sourceType !== 'DOCUMENT' || c.sourceFile, 'source_file_required', 400)
        demand(!c.validUntil || c.validUntil > now, 'source_expired', 400)
        if (c.intakeSourceId) {
          const source = s.get('intakeSource', c.intakeSourceId)
          demand(source?.companyId === a.subjectId && source.source.kind === c.sourceType && source.source.text.includes(c.excerpt), 'source_binding_invalid', 409)
          demand(c.sourceUrl === (source.source.kind === 'WEBSITE' ? source.source.reference : null)
            && c.sourceFile === (source.source.kind === 'DOCUMENT' ? source.source.reference ?? source.source.name : null), 'source_binding_invalid', 409)
        }
        return s.put('evidence', { ...base(now), ownerId: a.subjectId, entityType: c.entityType, entityId: c.entityId, field: c.field, value: c.value, sourceType: c.sourceType, sourceUrl: c.sourceUrl, sourceFile: c.sourceFile, sourceUser: human(a) ? a.subjectId : null, sourceAgent: human(a) ? null : 'Commerce Workbuddy', excerpt: c.excerpt, verificationStatus: 'AI_INFERRED', confidence: null, capturedAt: now, validUntil: c.validUntil, revoked: false, ...(c.intakeSourceId ? { intakeSourceId: c.intakeSourceId } : {}) })
      }
      case 'evidence.revoke': {
        const r = s.require('evidence', c.id, c.expectedRevision); demand(r.ownerId === a.subjectId && human(a))
        return s.put('evidence', { ...next(r, now), revoked: true })
      }
      case 'facts.confirm': {
        demand(human(a)); const r = this.own(c.entityType, c.id, a)
        demand(r.revision === c.expectedRevision, 'revision_conflict', 409)
        const facts: Record<string, Fact> = { ...r.facts }
        for (const field of c.fields) {
          const f = facts[field]; demand(f && f.value !== null && f.status !== 'CONFLICTING', 'fact_unresolved', 409)
          for (const key of f.evidenceIds) {
            const source = s.require('evidence', key)
            demand(!source.revoked && (!source.validUntil || source.validUntil > now), 'source_unavailable', 409)
            s.put('evidence', { ...next(source, now), verificationStatus: 'USER_CONFIRMED' })
          }
          const e = s.put('evidence', { ...base(now), ownerId: a.subjectId, entityType: c.entityType, entityId: c.id, field, value: f.value, sourceType: 'USER', sourceUrl: null, sourceFile: null, sourceUser: a.subjectId, sourceAgent: null, excerpt: `Human confirmed ${field} at revision ${r.revision}`, verificationStatus: 'USER_CONFIRMED', confidence: null, capturedAt: now, validUntil: null, revoked: false })
          facts[field] = { ...f, status: 'USER_CONFIRMED', visibility: c.visibility, evidenceIds: [...f.evidenceIds, e.id] }
        }
        return s.put(c.entityType, { ...next(r, now), facts } as Records[typeof c.entityType])
      }
      case 'product.pause': {
        const r = s.require('product', c.id, c.expectedRevision); demand(factory(a) && human(a) && r.companyId === a.subjectId)
        return s.put('product', { ...next(r, now), paused: c.paused })
      }
      case 'opportunity.build': {
        const p = s.require('product', c.productId); demand(factory(a) && p.companyId === a.subjectId)
        demand(this.readiness(p.id).status === 'OPPORTUNITY_READY', 'product_not_ready', 409)
        const passport = s.require('passport', p.id)
        demand(passport.facts['commercial.currency']?.value === c.currency, 'currency_mismatch', 409)
        return s.put('opportunity', { ...base(now), companyId: p.companyId, productId: p.id, passportRevision: passport.revision, companyRevision: s.require('company', p.companyId).revision, targetMarket: c.targetMarket, targetBrandTypes: c.targetBrandTypes, targetCustomerTypes: c.targetCustomerTypes, suggestedRetailPrice: c.suggestedRetailPrice, currency: c.currency, launchRequirements: c.launchRequirements, status: 'DRAFT' })
      }
      case 'opportunity.release': {
        const r = s.require('opportunity', c.id, c.expectedRevision); demand(factory(a) && human(a) && r.companyId === a.subjectId)
        if (c.available) demand(this.available({ ...r, status: 'AVAILABLE' }), 'product_not_ready', 409)
        return s.put('opportunity', { ...next(r, now), status: c.available ? 'AVAILABLE' : 'PAUSED' })
      }
      case 'match.run': {
        demand(!factory(a)); const profile = s.require('merchantProfile', a.subjectId), facts = this.facts(profile, false)
        demand(profileRequired.every(k => facts[k]), 'merchant_profile_incomplete', 409)
        const previous = s.list('match').filter(m => m.merchantId === a.subjectId), results: Records['match'][] = []
        for (const o of s.list('opportunity')) {
          if (!this.available(o) || results.length >= this.matchLimit) continue
          const existing = previous.find(m => m.opportunityId === o.id)
          const rejectedProduct = previous.some(m => m.feedback === 'NOT_INTERESTED' && s.require('opportunity', m.opportunityId).productId === o.productId)
          if (rejectedProduct) continue
          const fit = matchOpportunity(facts, this.facts(s.require('passport', o.productId)), o)
          if (!fit) continue
          results.push(s.put('match', { ...(existing ? next(existing, now) : base(now)), merchantId: a.subjectId, opportunityId: o.id, opportunityRevision: o.revision, profileRevision: profile.revision, ...fit, feedback: existing?.feedback ?? 'NONE', reason: existing?.reason ?? null }))
        }
        return results
      }
      case 'match.feedback': {
        const { m } = this.currentMatch(c.id, a); demand(human(a) && m.revision === c.expectedRevision, 'revision_conflict', 409)
        demand(c.feedback !== 'NOT_INTERESTED' || c.reason !== null, 'feedback_reason_required', 400)
        return s.put('match', { ...next(m, now), feedback: c.feedback, reason: c.feedback === 'SAVED' ? null : c.reason })
      }
      case 'sample.request': {
        demand(human(a)); const { m, o } = this.currentMatch(c.matchId, a)
        demand(m.feedback !== 'NOT_INTERESTED', 'opportunity_declined', 409)
        demand(!s.list('sample').some(r => r.merchantId === a.subjectId && r.opportunityId === o.id && !['REJECTED', 'CANCELLED'].includes(r.status)), 'sample_already_requested', 409)
        return s.put('sample', { ...base(now), merchantId: a.subjectId, companyId: o.companyId, productId: o.productId, opportunityId: o.id, matchId: m.id, variant: c.variant, shippingAddress: c.shippingAddress, sampleCost: null, shippingCost: null, currency: o.currency, status: 'REQUESTED', supplierResponse: '', tracking: '' })
      }
      case 'sample.transition': {
        demand(human(a)); const r = s.require('sample', c.id, c.expectedRevision)
        const supplier = factory(a) && r.companyId === a.subjectId, buyer = !factory(a) && r.merchantId === a.subjectId
        demand(supplier || buyer)
        const transitions: Record<Records['sample']['status'], string[]> = { REQUESTED: ['CONFIRMED', 'REJECTED', 'CANCELLED'], CONFIRMED: ['SHIPPED', 'CANCELLED'], SHIPPED: ['DELIVERED'], DELIVERED: ['ACCEPTED', 'REJECTED'], ACCEPTED: [], REJECTED: [], CANCELLED: [] }
        demand(transitions[r.status].includes(c.status), 'invalid_transition', 409)
        demand(c.status === 'CANCELLED' ? buyer : ['CONFIRMED', 'SHIPPED'].includes(c.status) || (c.status === 'REJECTED' && r.status === 'REQUESTED') ? supplier : buyer)
        if (c.status === 'CONFIRMED') demand(c.sampleCost !== null && c.shippingCost !== null, 'sample_cost_unknown', 409)
        if (c.status === 'SHIPPED') demand(c.tracking.trim(), 'tracking_required', 409)
        return s.put('sample', { ...next(r, now), status: c.status, ...(supplier ? { sampleCost: c.sampleCost, shippingCost: c.shippingCost, supplierResponse: c.supplierResponse, tracking: c.tracking } : {}) })
      }
      case 'launch.prepare': {
        demand(!factory(a) && human(a)); const sample = s.require('sample', c.sampleId)
        demand(sample.merchantId === a.subjectId && sample.status === 'ACCEPTED', 'sample_acceptance_required', 409)
        const { o } = this.currentMatch(sample.matchId, a)
        demand(!s.list('launch').some(l => l.sampleId === sample.id), 'launch_already_exists', 409)
        const profile = s.require('merchantProfile', a.subjectId), passport = s.require('passport', sample.productId)
        const cost = this.facts(passport)['commercial.cost']?.value
        const l = s.put('launch', { ...base(now), merchantId: a.subjectId, productId: sample.productId, opportunityId: o.id, sampleId: sample.id, passportRevision: passport.revision, profileRevision: profile.revision, status: 'PREPARING', launchDate: null, targetPrice: c.targetPrice, unitSupplyCost: typeof cost === 'number' && cost >= 0 ? cost : null, targetMargin: c.targetMargin, initialInventoryModel: c.initialInventoryModel, currency: sample.currency, shopifyProductId: null, decision: null, decisionEvidenceId: null })
        const kit = launchKit(l, this.facts(passport), this.facts(profile, false), now)
        s.put('listing', kit.listing); for (const artifact of kit.artifacts) s.put('artifact', artifact)
        return l
      }
      case 'approval.request': {
        demand(!factory(a)); const l = s.require('launch', c.launchId, c.expectedRevision); demand(l.merchantId === a.subjectId)
        demand(l.status === 'READY' && l.shopifyProductId, 'shopify_draft_required', 409)
        this.assertLaunchCurrent(l)
        const listing = s.list('listing').find(x => x.launchId === l.id)!
        return s.put('approval', { ...base(now), merchantId: a.subjectId, launchId: l.id, launchRevision: l.revision, listingRevision: listing.revision, status: 'PENDING', action: 'SHOPIFY_PUBLISH' })
      }
      case 'approval.decide': {
        demand(!factory(a) && human(a)); const r = s.require('approval', c.id, c.expectedRevision); demand(r.merchantId === a.subjectId && r.status === 'PENDING')
        this.assertLaunchCurrent(s.require('launch', r.launchId, r.launchRevision))
        return s.put('approval', { ...next(r, now), status: c.approve ? 'APPROVED' : 'REJECTED' })
      }
      case 'performance.record': {
        demand(!factory(a) && human(a)); const l = s.require('launch', c.launchId); demand(l.merchantId === a.subjectId)
        demand(['LIVE', 'PAUSED', 'SCALE', 'STOPPED'].includes(l.status), 'launch_not_live', 409)
        demand(l.currency === c.currency && (!l.launchDate || c.periodStart >= l.launchDate) && c.periodEnd <= now, 'invalid_performance_period', 409)
        demand(!s.list('performance').some(p => p.launchId === l.id && p.periodStart < c.periodEnd && p.periodEnd > c.periodStart), 'performance_period_overlap', 409)
        const cost = l.unitSupplyCost
        return s.put('performance', { ...base(now), merchantId: a.subjectId, launchId: l.id, source: 'MERCHANT_REPORT', sourceReference: c.sourceReference, periodStart: c.periodStart, periodEnd: c.periodEnd, currency: c.currency, views: c.views, addToCart: c.addToCart, orders: c.orders, unitsSold: c.unitsSold, revenue: c.revenue, refunds: c.refunds, grossMarginEstimate: typeof cost === 'number' ? c.revenue - c.refunds - cost * c.unitsSold : null })
      }
      case 'launch.decision': {
        demand(!factory(a) && human(a)); const l = s.require('launch', c.id, c.expectedRevision); demand(l.merchantId === a.subjectId)
        const p = s.require('performance', c.performanceId); demand(p.launchId === l.id && p.merchantId === a.subjectId)
        demand(['LIVE', 'SCALE', 'PAUSED'].includes(l.status), 'invalid_transition', 409)
        if (c.decision === 'SCALE') demand(p.orders > 0 && p.grossMarginEstimate !== null && p.grossMarginEstimate > 0, 'scale_evidence_missing', 409)
        return s.put('launch', { ...next(l, now), status: c.decision === 'STOP' ? 'STOPPED' : c.decision === 'SCALE' ? 'SCALE' : l.status, decision: c.decision, decisionEvidenceId: p.id })
      }
      default: { const never: never = c; throw new Error(`Unsupported command ${String(never)}`) }
    }
  }
  /** Refuse stale sources before any external draft or publication.
   * @param launch - Stored launch.
   */
  assertLaunchCurrent(launch: Records['launch']): void {
    const o = this.store.require('opportunity', launch.opportunityId)
    const profile = this.store.require('merchantProfile', launch.merchantId), facts = this.facts(profile, false)
    demand(this.available(o) && this.store.require('passport', launch.productId).revision === launch.passportRevision && profile.revision === launch.profileRevision && profileRequired.every(k => facts[k]), 'launch_sources_stale', 409)
  }
  /** Return role-scoped projections; merchants cannot browse unmatched supply.
   * @param a - Authenticated caller.
   * @returns Business home data without credentials or other merchants' records.
   */
  snapshot(a: Principal): import('./workspace-view.ts').WorkspaceView {
    const s = this.store
    if (factory(a)) {
      const products = s.list('product').filter(p => p.companyId === a.subjectId)
      return { role: 'factory' as const, subjectId: a.subjectId, company: s.get('company', a.subjectId), products: products.map(p => ({ ...p, passport: s.require('passport', p.id), readiness: this.readiness(p.id) })), opportunities: s.list('opportunity').filter(o => o.companyId === a.subjectId), samples: s.list('sample').filter(x => x.companyId === a.subjectId), evidence: s.list('evidence').filter(e => e.ownerId === a.subjectId), activity: s.list('activity').filter(e => e.ownerId === a.subjectId) }
    }
    const profile = s.get('merchantProfile', a.subjectId)
    const profileFacts = profile ? this.facts(profile, false) : {}
    const matches = s.list('match').filter(m => m.merchantId === a.subjectId && m.feedback !== 'NOT_INTERESTED').filter(m => {
      const o = s.require('opportunity', m.opportunityId)
      return this.available(o) && o.revision === m.opportunityRevision && m.profileRevision === profile?.revision && profileRequired.every(k => profileFacts[k])
    }).map(m => { const o = s.require('opportunity', m.opportunityId), facts = this.facts(s.require('passport', o.productId)); return { ...m, opportunity: o, facts } })
    const owned = <K extends 'sample' | 'launch' | 'listing' | 'artifact' | 'approval' | 'performance'>(kind: K) => s.list(kind).filter(r => r.merchantId === a.subjectId)
    return { role: 'merchant' as const, subjectId: a.subjectId, merchant: s.get('merchant', a.subjectId), profile, matches, samples: owned('sample'), launches: owned('launch'), listings: owned('listing'), artifacts: owned('artifact'), approvals: owned('approval'), performance: owned('performance'), activity: s.list('activity').filter(e => e.ownerId === a.subjectId) }
  }
}
