/** Folder import inventory shares enterprise SQLite and records actual extraction/reading outcomes. */
import type { DatabaseSync } from 'node:sqlite'
import { sourceImport, sourceExclusion } from './source-schema.ts'
import type { SourceImport } from './source-schema.ts'
import type { z } from 'zod'
import type { sourceManifest } from './source-schema.ts'
import { GeoError } from './geo.ts'

/**
 * Store resumable inventories independently of browser lifetime.
 * @param db - Enterprise database with the source-import migration applied.
 * @returns Inventory operations; file storage and parsing remain owned by the upload route.
 */
export function sourceStore(db: DatabaseSync) {
  const list = (): SourceImport[] => db.prepare('SELECT data FROM enterprise_source_imports ORDER BY rowid DESC').all().map(row => sourceImport.parse(JSON.parse(String(row.data))))
  const get = (id: string): SourceImport => {
    const row = db.prepare('SELECT data FROM enterprise_source_imports WHERE id=?').get(id)
    if (!row) throw new GeoError(404, 'missing')
    return sourceImport.parse(JSON.parse(String(row.data)))
  }
  const write = (value: SourceImport): SourceImport => {
    db.prepare('INSERT INTO enterprise_source_imports(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, JSON.stringify(value))
    return value
  }
  const update = (id: string, path: string, patch: Partial<SourceImport['files'][number]>): void => {
    const value = get(id), file = value.files.find(file => file.path === path)
    if (!file) throw new GeoError(404, 'missing')
    Object.assign(file, patch)
    write(value)
  }
  return {
    list, get, update,
    forget(fileId: string): void {
      for (const batch of list()) for (const file of batch.files) if (file.fileId === fileId) update(batch.id, file.path, { status: 'failed', error: 'missing', readChunks: [], assessment: null })
    },
    create(input: z.infer<typeof sourceManifest>, maxFileBytes: number): SourceImport {
      const existing = list().find(item => item.id === input.id)
      if (existing) {
        if (JSON.stringify(existing.files.map(({ path, size }) => ({ path, size }))) !== JSON.stringify(input.files)) throw new GeoError(409, 'geoConflict')
        return existing
      }
      return write({ id: input.id, createdAt: new Date().toISOString(), files: input.files.map(file => {
        const error = sourceExclusion(file.path) ?? (file.size > maxFileBytes ? 'tooLarge' : file.size === 0 ? 'emptyFile' : null)
        return { ...file, status: error ? 'skipped' : 'pending', fileId: null, error, readChunks: [], assessment: null, chunkCount: 0 }
      }) })
    },
    read(fileId: string, chunks: number[]): void {
      for (const batch of list()) for (const file of batch.files) if (file.fileId === fileId) update(batch.id, file.path, { readChunks: [...new Set([...file.readChunks, ...chunks])].sort((a, b) => a - b) })
    },
    assess(id: string, path: string, assessment: NonNullable<SourceImport['files'][number]['assessment']>, chunkCount: number): void {
      const file = get(id).files.find(item => item.path === path)
      if (!file) throw new GeoError(404, 'missing')
      if (assessment.disposition === 'used' && (file.status !== 'imported' || !chunkCount || file.readChunks.length !== chunkCount)) throw new GeoError(409, 'sourceUnread')
      update(id, path, { assessment })
    },
    review(): Array<{ importId: string; path: string; status: string; assessment: SourceImport['files'][number]['assessment'] }> {
      return list().flatMap(batch => batch.files.map(file => ({ importId: batch.id, path: file.path, status: file.status, assessment: file.assessment })))
    },
  }
}
