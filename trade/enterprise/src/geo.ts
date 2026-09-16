/** GEO drafts share the enterprise SQLite owner and never feed public projections. */
import type { DatabaseSync } from 'node:sqlite'
import { geoRecord, geoMissing, geoProgress } from './geo-schema.ts'
import type { GeoFields, GeoRecord } from './geo-schema.ts'
import { normalizeProduct, productReadiness } from './geo-product.ts'

/** User-correctable revision, readiness, or lookup failure. */
export class GeoError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

/**
 * Access drafts inside one deployment-owned enterprise database.
 * @param db - Database with the GEO migration applied.
 * @returns Draft access and revision-checked confirmation for the chat review handler.
 */
export function geoStore(db: DatabaseSync) {
  const list = (): GeoRecord[] => db.prepare('SELECT data FROM enterprise_geo ORDER BY rowid DESC').all().map(row => geoRecord.parse(JSON.parse(String(row.data))))
  const get = (id: string): GeoRecord | null => {
    const row = db.prepare('SELECT data FROM enterprise_geo WHERE id=?').get(id)
    return row ? geoRecord.parse(JSON.parse(String(row.data))) : null
  }
  const transact = <T>(action: () => T): T => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = action(); db.exec('COMMIT'); return result }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
  const write = (record: GeoRecord): GeoRecord => {
    db.prepare('INSERT INTO enterprise_geo(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.id, JSON.stringify(record))
    return record
  }
  const progress = () => {
    const row = db.prepare('SELECT data FROM enterprise_geo_progress WHERE id=1').get()
    return row ? geoProgress.parse(JSON.parse(String(row.data))) : { sessionId: null, revision: 0, scopeIds: [], completedAt: null }
  }
  const saveProgress = (value: ReturnType<typeof progress>) => db.prepare('INSERT INTO enterprise_geo_progress(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(value))
  return {
    list,
    get,
    progress,
    verifyProduct: (id: GeoRecord['id'], expectedRevision: number): GeoRecord => transact(() => {
      const current = get(id)
      if (!current || current.kind !== 'product') throw new GeoError(404, 'missing')
      if (current.revision !== expectedRevision || current.status !== 'confirmed') throw new GeoError(409, 'geoConflict')
      const now = new Date()
      if (!productReadiness(current.product, true, now).previewReady) throw new GeoError(409, 'geoIncomplete')
      return write({ ...current, revision: current.revision + 1, productVerifiedAt: now.toISOString(), updatedAt: now.toISOString() })
    }),
    bind: (sessionId: string, expectedRevision: number) => transact(() => {
      const value = progress()
      if (value.revision !== expectedRevision) throw new GeoError(409, 'geoConflict')
      saveProgress({ ...value, sessionId, revision: value.revision + 1 })
    }),
    finish: (records: GeoRecord[]) => transact(() => {
      for (const record of records) {
        const current = get(record.id)
        if (!current || current.status !== 'confirmed' || current.revision !== record.revision) throw new GeoError(409, 'geoConflict')
      }
      const all = list()
      if (records.some(record => all.some(other => other.supersedesId === record.id))) throw new GeoError(409, 'geoConflict')
      const value = progress()
      saveProgress({ ...value, scopeIds: records.map(record => record.id), completedAt: new Date().toISOString(), revision: value.revision + 1 })
    }),
    setPublication: (id: GeoRecord['id'], publication: NonNullable<GeoRecord['product']>['publication']): GeoRecord => transact(() => {
      const current = get(id)
      if (!current || current.kind !== 'product' || current.status !== 'confirmed' || !current.product) throw new GeoError(409, 'geoIncomplete')
      return write({ ...current, product: { ...current.product, publication }, updatedAt: new Date().toISOString() })
    }),
    propose: (id: GeoRecord['id'], expectedRevision: number, fields: GeoFields, sessionId: GeoRecord['sessionId'], supersedesId: GeoRecord['id'] | null = null): GeoRecord => transact(() => {
      if (fields.product && fields.kind !== 'product') throw new GeoError(400, 'invalid')
      if (fields.product) fields = { ...fields, product: normalizeProduct(fields.product) }
      const existing = get(id)
      if (supersedesId) {
        const original = get(supersedesId)
        if (!original || original.status !== 'confirmed' || original.kind !== fields.kind || list().some(record => record.supersedesId === supersedesId && record.id !== id)) throw new GeoError(409, 'geoConflict')
      }
      if (existing) {
        if (existing.supersedesId !== supersedesId) throw new GeoError(409, 'geoConflict')
        if (existing.sessionId === sessionId && JSON.stringify(Object.fromEntries(Object.keys(fields).map(key => [key, existing[key as keyof GeoFields]]))) === JSON.stringify(fields)) return existing
        if (existing.revision !== expectedRevision || existing.status !== 'draft') throw new GeoError(409, 'geoConflict')
      } else if (expectedRevision !== 0) {
        throw new GeoError(409, 'geoConflict')
      }
      const value = progress()
      saveProgress({ ...value, completedAt: null, revision: value.revision + 1 })
      return write({ ...fields, sessionId, supersedesId, id, revision: (existing?.revision ?? 0) + 1, status: 'draft', createdBy: 'agent', updatedAt: new Date().toISOString(), confirmedAt: null })
    }),
    confirm: (id: GeoRecord['id'], expectedRevision: number, onConfirm: (record: GeoRecord) => void): GeoRecord => transact(() => {
      const current = get(id)
      if (!current) throw new GeoError(404, 'missing')
      if (current.revision !== expectedRevision || current.status !== 'draft') throw new GeoError(409, 'geoConflict')
      if (geoMissing(current).length) throw new GeoError(409, 'geoIncomplete')
      const now = new Date().toISOString()
      const confirmed = write({ ...current, revision: current.revision + 1, status: 'confirmed', updatedAt: now, confirmedAt: now })
      onConfirm(confirmed)
      return confirmed
    }),
  }
}
