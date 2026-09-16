/** SQLite storage for site state, with optimistic protection against stale writers. */
import { DatabaseSync } from 'node:sqlite'
import { parseSiteSnapshot } from './snapshot.ts'
import type { SiteSnapshot, SiteStateStore } from './types.ts'

const SCHEMA_VERSION = 1

/** Owns one SQLite connection; callers close it after all site operations settle. */
export class SqliteSiteStateStore implements SiteStateStore {
  private readonly database: DatabaseSync
  private generation = 0

  /** Open a dedicated site database and initialize its schema.
   * @param path - Database file path or SQLite's in-memory filename.
   */
  constructor(path: string) {
    this.database = new DatabaseSync(path)
    try {
      this.database.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE')
      try {
        const version = this.database.prepare('PRAGMA user_version').get()?.user_version
        if (version !== 0 && version !== SCHEMA_VERSION) throw new Error(`unsupported site database version: ${String(version)}`)
        if (version === 0) {
          this.database.exec(`CREATE TABLE site_state (id INTEGER PRIMARY KEY CHECK (id = 1), generation INTEGER NOT NULL, document TEXT NOT NULL); PRAGMA user_version = ${SCHEMA_VERSION}`)
        }
        this.database.exec('COMMIT')
      } catch (error) {
        this.database.exec('ROLLBACK')
        throw error
      }
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  /** Read a validated snapshot and establish the generation for subsequent writes.
   * @returns Stored state, or undefined when no state has been committed.
   */
  load(): SiteSnapshot | undefined {
    const row = this.database.prepare('SELECT generation, document FROM site_state WHERE id = 1').get()
    if (!row) { this.generation = 0; return undefined }
    if (typeof row.generation !== 'number' || typeof row.document !== 'string') throw new Error('invalid site database state')
    const snapshot = parseSiteSnapshot(JSON.parse(row.document))
    this.generation = row.generation
    return snapshot
  }

  /** Commit state only if no other connection has replaced the observed generation.
   * @param snapshot - Complete validated service state.
   * @throws On stale writers or storage failure; the previous document remains intact.
   */
  commit(snapshot: SiteSnapshot): void {
    const document = JSON.stringify(parseSiteSnapshot(snapshot))
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const current = this.database.prepare('SELECT generation FROM site_state WHERE id = 1').get()
      if ((current?.generation ?? 0) !== this.generation) throw new Error('site database changed in another writer; reload before retrying')
      const generation = this.generation + 1
      this.database.prepare('INSERT INTO site_state (id, generation, document) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET generation = excluded.generation, document = excluded.document').run(generation, document)
      this.database.exec('COMMIT')
      this.generation = generation
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  /** Close the connection after its owning service has stopped accepting work. */
  close(): void { this.database.close() }
}
