/** External intake persists private drafts through the same authorized Commerce commands. */
import { base, BusinessError } from './database.ts'
import type { CommerceDatabase } from './database.ts'
import { companyFields, productFields } from './schema.ts'
import type { Command, Fact, Id, IntakeCommand, Principal, Records } from './schema.ts'

function demand(condition: unknown, code: string, status = 409): asserts condition {
  if (!condition) throw new BusinessError(code, status)
}

/** Read only a source belonging to the authenticated supplier.
 * @param store - Business database.
 * @param actor - Server-authenticated identity.
 * @param sourceId - Immutable source id.
 * @returns The supplied text and provenance, which remain untrusted client input.
 */
export function intakeSource(store: CommerceDatabase, actor: Principal, sourceId: Id) {
  demand(actor.role === 'factory-agent', 'factory_agent_required', 403)
  const source = store.get('intakeSource', sourceId)
  demand(source?.companyId === actor.subjectId, 'source_not_found', 404)
  return source
}

function touch(store: CommerceDatabase, owner: Id, now: string) {
  const current = store.require('onboarding', owner)
  return store.put('onboarding', { ...current, revision: current.revision + 1, updatedAt: now, submission: null })
}

function sourcedName(store: CommerceDatabase, owner: Id, entity: Id, field: string, fact: Fact | undefined, now: string) {
  return typeof fact?.value === 'string' && Boolean(fact.value.trim()) && fact.status !== 'CONFLICTING' && fact.evidenceIds.length > 0
    && fact.evidenceIds.every(id => {
      const evidence = store.get('evidence', id)
      return evidence?.ownerId === owner && evidence.entityId === entity && evidence.field === field && !evidence.revoked
        && (!evidence.validUntil || evidence.validUntil > now) && evidence.value === fact.value
    })
}

/** Execute an intake command inside CommerceService's atomic, idempotent transaction.
 * @param store - Database already in the command transaction.
 * @param actor - Server-authenticated supplier agent.
 * @param command - Parsed intake command.
 * @param now - Service clock value.
 * @param save - Existing business-command dispatcher, without a nested transaction.
 * @returns Saved drafts, sources, or the exact submitted scope.
 */
export function executeIntake(store: CommerceDatabase, actor: Principal, command: IntakeCommand, now: string, save: (command: Command) => unknown): unknown {
  demand(actor.role === 'factory-agent', 'factory_agent_required', 403)
  const owner = actor.subjectId
  if (command.type === 'onboarding.start') {
    return store.get('onboarding', owner) ?? store.put('onboarding', { ...base(now, owner), submission: null })
  }
  store.require('onboarding', owner)

  const saveDraft = (kind: 'company' | 'passport', key: Id, expectedRevision: number, values: Record<string, { value: Fact['value']; sources: { id: Id; excerpt: string }[] }>) => {
    const facts: Record<string, Fact> = {}
    const references = new Map<string, { source: Records['intakeSource']; excerpt: string }[]>()
    for (const [field, input] of Object.entries(values)) {
      const refs = input.sources.map(ref => {
        const source = intakeSource(store, actor, ref.id)
        demand(source.source.text.includes(ref.excerpt), 'source_excerpt_mismatch')
        return { source, excerpt: ref.excerpt }
      })
      demand(new Set(input.sources.map(ref => `${ref.id}\0${ref.excerpt}`)).size === refs.length, 'duplicate_source_reference')
      references.set(field, refs)
      facts[field] = { value: input.value, status: input.value === null ? 'UNKNOWN' : 'AI_INFERRED', visibility: 'CONFIDENTIAL', evidenceIds: [] }
    }
    demand(Object.keys(facts).length > 0, 'facts_required')
    const type = kind === 'company' ? 'company.save' : 'product.save'
    const record = save({ type, requestId: command.requestId, id: key, expectedRevision, facts }) as Records['company'] | Records['passport']
    for (const [field, refs] of references) {
      for (const { source, excerpt } of refs) {
        const evidence = save({
          type: 'evidence.add', requestId: command.requestId, entityType: kind, entityId: key, field,
          value: facts[field]!.value, sourceType: source.source.kind,
          sourceUrl: source.source.kind === 'WEBSITE' ? source.source.reference : null,
          sourceFile: source.source.kind === 'DOCUMENT' ? source.source.reference ?? source.source.name : null,
          excerpt, validUntil: null, intakeSourceId: source.id,
        }) as Records['evidence']
        facts[field]!.evidenceIds.push(evidence.id)
      }
    }
    return Object.values(facts).some(fact => fact.evidenceIds.length)
      ? save({ type, requestId: command.requestId, id: key, expectedRevision: record.revision, facts })
      : record
  }

  switch (command.type) {
    case 'onboarding.source': {
      const existing = store.get('intakeSource', command.id)
      if (existing) {
        demand(existing.companyId === owner, 'source_not_found', 404)
        demand(JSON.stringify(existing.source) === JSON.stringify(command.source), 'source_immutable')
        return existing
      }
      const source = store.put('intakeSource', { ...base(now, command.id), companyId: owner, source: command.source })
      touch(store, owner, now)
      return source
    }
    case 'onboarding.company': {
      const company = saveDraft('company', owner, command.expectedRevision, command.facts)
      touch(store, owner, now)
      return company
    }
    case 'onboarding.products': {
      demand(new Set(command.products.map(p => p.id)).size === command.products.length, 'duplicate_product')
      const products = command.products.map(p => saveDraft('passport', p.id, p.expectedRevision, p.facts))
      touch(store, owner, now)
      return { products }
    }
    case 'onboarding.submit': {
      const current = store.require('onboarding', owner, command.expectedRevision)
      const company = store.require('company', owner, command.companyRevision)
      demand(sourcedName(store, owner, owner, 'legal_name', company.facts.legal_name, now) || sourcedName(store, owner, owner, 'display_name', company.facts.display_name, now), 'company_name_source_required')
      demand(new Set(command.products.map(p => p.id)).size === command.products.length, 'duplicate_product')
      for (const product of command.products) {
        const passport = store.get('passport', product.id)
        demand(passport?.companyId === owner, 'product_not_found', 404)
        demand(passport.revision === product.revision, 'revision_conflict')
        demand(sourcedName(store, owner, passport.id, 'identity.product_name', passport.facts['identity.product_name'], now), 'product_name_source_required')
      }
      return store.put('onboarding', { ...current, revision: current.revision + 1, updatedAt: now, submission: { companyRevision: company.revision, products: command.products, submittedAt: now } })
    }
    default: { const never: never = command; throw new Error(`Unsupported intake command ${String(never)}`) }
  }
}

/** Project persistent intake progress without treating inferred drafts as commercially verified.
 * @param store - Business database.
 * @param actor - Server-authenticated supplier agent.
 * @param now - Current service time for source expiry.
 * @returns Private records, source metadata, missing values, and exact submission freshness.
 */
export function intakeStatus(store: CommerceDatabase, actor: Principal, now: string) {
  demand(actor.role === 'factory-agent', 'factory_agent_required', 403)
  const owner = actor.subjectId, onboarding = store.get('onboarding', owner), company = store.get('company', owner)
  const products = store.list('passport').filter(p => p.companyId === owner)
  const submission = onboarding?.submission
  const current = Boolean(submission && company?.revision === submission.companyRevision
    && (sourcedName(store, owner, owner, 'legal_name', company.facts.legal_name, now) || sourcedName(store, owner, owner, 'display_name', company.facts.display_name, now))
    && submission.products.every(p => products.some(saved => saved.id === p.id && saved.revision === p.revision && sourcedName(store, owner, saved.id, 'identity.product_name', saved.facts['identity.product_name'], now))))
  const missing = (fields: readonly string[], facts: Record<string, Fact>) => fields.filter(field => !facts[field] || facts[field].value === null || facts[field].status === 'CONFLICTING')
  return {
    companyId: owner, onboarding, status: !onboarding ? 'NOT_STARTED' : current ? 'SUBMITTED' : 'DRAFT',
    company, products,
    sources: store.list('intakeSource').filter(s => s.companyId === owner).map(s => ({ id: s.id, name: s.source.name, kind: s.source.kind, reference: s.source.reference, characters: s.source.text.length })),
    missingFields: { company: missing(companyFields, company?.facts ?? {}), products: products.map(p => ({ id: p.id, fields: missing(productFields, p.facts) })) },
    nextActions: !onboarding ? ['trade_start_onboarding'] : !company ? ['trade_add_source', 'trade_save_company'] : current ? ['Review private drafts in the Commerce workspace when commercial use is needed.'] : ['Fill known facts with source excerpts; leave unknown values null.', 'Call trade_submit_onboarding with the exact company and selected product revisions.'],
  }
}
