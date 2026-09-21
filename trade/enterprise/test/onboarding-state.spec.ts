/** Milestones reject unread uploads, unresolved sources and unreviewed revisions. */
import { describe, expect, it } from 'vitest'
import { onboardingSteps } from '../src/onboarding-state.ts'
import { snapshotSchema } from '../src/schema.ts'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const time = '2026-09-21T00:00:00Z'
function fixture() {
  return snapshotSchema.parse({
    profile: null, submittedAt: null, files: [{ id: id(1), name: 'catalog.txt', mime: 'text/plain', category: 'document', knowledgeStatus: 'ready', size: 100, createdAt: time }], maxFileBytes: 1024, tasks: [], goals: [], approvals: [],
    geo: ['company', 'product'].map((kind, index) => ({ id: id(index + 2), kind, name: kind, description: 'Supported facts', sections: [{ label: 'Fact', content: 'Recorded fact', source: 'catalog.txt' }], questions: '', status: 'confirmed', revision: 2, sessionId: 'fixture', createdBy: 'agent', updatedAt: time, confirmedAt: time })),
    onboarding: { sessionId: 'fixture', revision: 1, scopeIds: [], completedAt: null },
    imports: [{ id: id(4), createdAt: time, files: [{ path: 'Company/catalog.txt', size: 100, status: 'imported', fileId: id(1), error: null, readChunks: [], assessment: null, chunkCount: 2 }] }],
  })
}

describe('onboarding milestones', () => {
  it('does not count an indexed upload as read or a reviewed company as a reviewed product revision', () => {
    const data = fixture()
    data.geo.push({ ...data.geo[1]!, id: id(5) as typeof data.geo[number]['id'], supersedesId: data.geo[1]!.id, revision: 1, status: 'draft', confirmedAt: null })
    expect(onboardingSteps(data)).toEqual([true, false, false, false])
    const source = data.imports![0]!.files[0]!
    source.readChunks = [1, 2]
    source.assessment = { disposition: 'used', reason: 'Complete source read' }
    expect(onboardingSteps(data)).toEqual([true, true, false, false])
    data.geo[2]!.status = 'confirmed'
    expect(onboardingSteps(data)).toEqual([true, true, true, false])
    data.onboarding.completedAt = time
    data.onboarding.scopeIds = [data.geo[0]!.id, data.geo[2]!.id]
    expect(onboardingSteps(data)).toEqual([true, true, true, true])
    data.geo.push({ ...data.geo[1]!, id: id(6) as typeof data.geo[number]['id'], status: 'draft' })
    expect(onboardingSteps(data)).toEqual([true, true, true, true])
  })

  it('keeps missing, truncated, partial and unresolved sources incomplete', () => {
    for (const change of ['missing', 'truncated', 'partial', 'needs_input', 'pending'] as const) {
      const data = fixture(), source = data.imports![0]!.files[0]!
      source.readChunks = [1, 2]
      source.assessment = { disposition: 'used', reason: 'Source' }
      if (change === 'missing') data.files = []
      if (change === 'truncated') data.files[0]!.textTruncated = true
      if (change === 'partial') source.readChunks = [1]
      if (change === 'needs_input') source.assessment.disposition = 'needs_input'
      if (change === 'pending') source.status = 'pending'
      expect(onboardingSteps(data)[1], change).toBe(false)
    }
  })

  it('accepts explicit exclusions and sourced conversational records, ignoring archived products', () => {
    const data = fixture()
    data.imports![0]!.files[0]!.assessment = { disposition: 'excluded', reason: 'Outside the selected scope' }
    data.geo.push({ ...data.geo[1]!, id: id(5) as typeof data.geo[number]['id'], status: 'draft', archivedAt: time })
    expect(onboardingSteps(data)).toEqual([true, true, true, false])
    data.imports = []
    expect(onboardingSteps(data)).toEqual([true, true, true, false])
    data.geo[0]!.sections[0]!.source = ''
    expect(onboardingSteps(data)[1]).toBe(false)
    expect(onboardingSteps(null)).toEqual([false, false, false, false])
  })
})
