/** Transactional deployment records separate from editable site source. */
import { DatabaseSync } from 'node:sqlite'
import { hostingStateSchema, type SiteHostingState } from './site-hosting-schema.ts'
import type { SiteId } from '../../../packages/site/site/src/types.ts'

const SCHEMA_VERSION = 1

/** Owns a dedicated hosting database; close only after all provider calls settle. */
export class SiteHostingStore {
  private readonly database: DatabaseSync

  /** Open and validate deployment storage.
   * @param path - Dedicated SQLite filename, or :memory: for an isolated fixture.
   */
  constructor(path: string) {
    this.database = new DatabaseSync(path)
    try {
      this.database.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE')
      const version = this.database.prepare('PRAGMA user_version').get()?.user_version
      if (version !== 0 && version !== SCHEMA_VERSION) throw new Error('Unsupported hosting database version')
      if (version === 0) this.database.exec(`CREATE TABLE hosting (site_id TEXT PRIMARY KEY, generation INTEGER NOT NULL, document TEXT NOT NULL); PRAGMA user_version = ${SCHEMA_VERSION}`)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  /** Load a site's validated deployment history.
   * @param siteId - Site already authorized by the caller.
   * @returns Detached state, including an empty history for a new site.
   */
  get(siteId: SiteId): SiteHostingState {
    const row = this.database.prepare('SELECT document FROM hosting WHERE site_id = ?').get(siteId)
    if (!row) return { siteId, generation: 0, deployments: [] }
    if (typeof row.document !== 'string') throw new Error('Invalid hosting record')
    const state = hostingStateSchema.parse(JSON.parse(row.document))
    if (state.siteId !== siteId) throw new Error('Hosting record site mismatch')
    return state
  }

  /** Commit only against the generation observed before the operation.
   * @param state - Updated state carrying its prior generation.
   * @returns Detached state with its committed generation.
   * @throws When another writer changed the record; never overwrites newer state.
   */
  put(state: SiteHostingState): SiteHostingState {
    const next = hostingStateSchema.parse({ ...state, generation: state.generation + 1 })
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const prior = this.database.prepare('SELECT generation FROM hosting WHERE site_id = ?').get(state.siteId)
      if ((prior?.generation ?? 0) !== state.generation) throw new Error('Hosting record changed in another writer')
      this.database.prepare('INSERT INTO hosting (site_id, generation, document) VALUES (?, ?, ?) ON CONFLICT(site_id) DO UPDATE SET generation = excluded.generation, document = excluded.document').run(state.siteId, next.generation, JSON.stringify(next))
      this.database.exec('COMMIT')
      return next
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  /** Close this store after the owning HTTP adapter drains its requests. */
  close(): void { this.database.close() }
}
