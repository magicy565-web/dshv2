/** Onboarding indicators reflect source coverage and current record reviews, not upload counts. */
import type { Snapshot } from './schema.ts'

/**
 * Derive the four displayed milestones from persisted records.
 * @param data - Current enterprise snapshot, or null while loading.
 * @returns Identity, source processing, record review and explicit scope confirmation.
 */
export function onboardingSteps(data: Snapshot | null): [boolean, boolean, boolean, boolean] {
  if (!data) return [false, false, false, false]
  const current = data.geo.filter(record => !record.archivedAt && !data.geo.some(next => next.supersedesId === record.id && !next.archivedAt))
  const identity = Boolean(data.profile || current.some(record => record.kind === 'company'))
  const sources = data.imports?.length ? data.imports.every(batch => batch.files.every(file => {
    if (file.status === 'skipped') return true
    if (file.status === 'pending' || !file.assessment || file.assessment.disposition === 'needs_input') return false
    if (file.assessment.disposition === 'excluded') return true
    const asset = data.files.find(asset => asset.id === file.fileId)
    return Boolean(asset && !asset.textTruncated && file.status === 'imported' && file.chunkCount > 0 && file.readChunks.length === file.chunkCount)
  })) : current.length > 0 && current.every(record => record.sections.length > 0 && record.sections.every(section => section.source.trim()))
  const reviewRecords = data.onboarding.completedAt ? data.onboarding.scopeIds.flatMap(id => data.geo.filter(record => record.id === id && !record.archivedAt)) : current
  const reviewed = reviewRecords.some(record => record.kind === 'company' && record.status === 'confirmed') && reviewRecords.every(record => record.status === 'confirmed')
  return [identity, sources, reviewed, Boolean(data.onboarding.completedAt)]
}
