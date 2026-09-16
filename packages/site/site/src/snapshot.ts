/** File-input validation for site records and their ownership references. */
import type { SiteSnapshot, SiteChangeSet } from './types.ts'
import { assertValidSiteChangeSet } from './validation.ts'

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalText(value: unknown): boolean {
  return value === undefined || text(value)
}

function strings(value: unknown): boolean {
  return Array.isArray(value) && value.every(text)
}

function changeSet(value: unknown): boolean {
  if (!object(value) || !optionalText(value.baseRevisionId)) return false
  if (value.productOrder !== undefined && !strings(value.productOrder)) return false
  if (value.pages !== undefined) {
    if (!Array.isArray(value.pages)) return false
    for (const page of value.pages) {
      if (!object(page) || !text(page.id) || !text(page.title) || !text(page.path)) return false
      if (!['home', 'product', 'collection', 'campaign'].includes(String(page.kind))) return false
      if (page.productIds !== undefined && !strings(page.productIds)) return false
      if (page.seo !== undefined && (!object(page.seo)
        || (page.seo.title !== undefined && typeof page.seo.title !== 'string')
        || (page.seo.description !== undefined && typeof page.seo.description !== 'string'))) return false
    }
  }
  if (value.theme !== undefined) {
    const theme = value.theme
    if (!object(theme) || !object(theme.colors) || !object(theme.fonts) || !object(theme.layout)) return false
    if (!Object.values(theme.colors).every(item => typeof item === 'string')) return false
    if (!Object.values(theme.fonts).every(item => typeof item === 'string')) return false
    if (!Object.values(theme.layout).every(item => typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))) return false
  }
  return true
}

/** Parse editable content arriving from HTTP or model JSON.
 * @param value - Untrusted structured changes.
 * @returns A detached, validated change set.
 * @throws If field types or page validation fail.
 */
export function parseSiteChangeSet(value: unknown): SiteChangeSet {
  if (!changeSet(value)) throw new Error('invalid site change set fields')
  const parsed = structuredClone(value) as SiteChangeSet
  assertValidSiteChangeSet(parsed)
  return parsed
}

/** Validate a complete file snapshot before replacing any live state.
 * @param value - Parsed JSON or an imported snapshot.
 * @returns A detached snapshot with valid same-site references.
 * @throws When records, uniqueness, or ownership references are invalid.
 */
export function parseSiteSnapshot(value: unknown): SiteSnapshot {
  if (!object(value) || !Array.isArray(value.sites) || !Array.isArray(value.revisions) || !Array.isArray(value.jobs)) throw new Error('invalid site snapshot')
  const siteIds = new Set<string>()
  for (const site of value.sites) {
    if (!object(site) || !text(site.id) || !text(site.tenantId) || !text(site.connectionId) || !text(site.name)
      || !optionalText(site.currentRevisionId) || !optionalText(site.publishedRevisionId)) throw new Error('invalid site snapshot: site')
    if (siteIds.has(site.id)) throw new Error('invalid site snapshot: duplicate site')
    siteIds.add(site.id)
  }
  const revisions = new Map<string, Record<string, unknown>>()
  for (const revision of value.revisions) {
    if (!object(revision) || !text(revision.id) || !text(revision.siteId) || !siteIds.has(revision.siteId)
      || !text(revision.createdAt) || !Number.isFinite(Date.parse(revision.createdAt))
      || !['user', 'agent', 'rollback'].includes(String(revision.source)) || !changeSet(revision.changeSet)) throw new Error('invalid site snapshot: revision')
    if (revisions.has(revision.id)) throw new Error('invalid site snapshot: duplicate revision')
    revisions.set(revision.id, revision)
  }
  const jobIds = new Set<string>()
  for (const job of value.jobs) {
    if (!object(job) || !text(job.id) || !text(job.siteId) || !text(job.revisionId)
      || revisions.get(job.revisionId)?.siteId !== job.siteId
      || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.status))
      || (job.error !== undefined && typeof job.error !== 'string')) throw new Error('invalid site snapshot: publication job')
    if (jobIds.has(job.id)) throw new Error('invalid site snapshot: duplicate job')
    jobIds.add(job.id)
  }
  // All record fields are checked above; the remaining pass checks typed relationships.
  const snapshot = structuredClone(value) as unknown as SiteSnapshot
  for (const site of snapshot.sites) {
    for (const id of [site.currentRevisionId, site.publishedRevisionId]) {
      if (id !== undefined && revisions.get(id)?.siteId !== site.id) throw new Error('invalid site snapshot: site revision reference')
    }
  }
  for (const revision of snapshot.revisions) {
    assertValidSiteChangeSet(revision.changeSet)
    const base = revision.changeSet.baseRevisionId
    if (base !== undefined && (base === revision.id || revisions.get(base)?.siteId !== revision.siteId)) throw new Error('invalid site snapshot: base revision reference')
    const seen = new Set<string>([revision.id])
    let parent = base
    while (parent !== undefined) {
      if (seen.has(parent)) throw new Error('invalid site snapshot: revision cycle')
      seen.add(parent)
      parent = snapshot.revisions.find(item => item.id === parent)?.changeSet.baseRevisionId
    }
  }
  return snapshot
}
