/** Atomic, versioned business storage; each entity has a separate durable table. */
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { id, schemas } from './schema.ts'
import type { Id, Kind, Records } from './schema.ts'

/** Caller-visible errors contain no provider credentials or database paths. */
export class BusinessError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code) }
}
const migrations: Kind[][] = [
  ['company', 'product', 'passport', 'evidence', 'activity'],
  ['opportunity', 'merchant', 'merchantProfile', 'match'],
  ['sample', 'launch', 'listing', 'artifact'],
  ['performance', 'approval'],
  [],
  [],
  ['onboarding', 'intakeSource'],
]
/** Business database owner. Call close before removing its file. */
export class CommerceDatabase {
  readonly db: DatabaseSync
  constructor(path: string) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;')
      this.transaction(() => {
        const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version)
        if (version > migrations.length) throw new BusinessError('database_version_unsupported', 500)
        for (let next = version; next < migrations.length; next++) {
          for (const kind of migrations[next]!) this.db.exec(`CREATE TABLE ${kind} (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)))`)
          if (next === 0) this.db.exec('CREATE TABLE receipts (actor TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(actor, request_id))')
          if (next === 4) this.db.exec('CREATE TABLE enterprise_imports (owner TEXT NOT NULL, source TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(owner,source)); CREATE TABLE linked_sessions (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, binding TEXT NOT NULL, expires_at TEXT NOT NULL)')
          if (next === 5) this.db.exec("ALTER TABLE linked_sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'factory'; CREATE TABLE commerce_store_bindings (merchant TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE launch_store_bindings (launch TEXT PRIMARY KEY, merchant TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)))")
          this.db.exec(`PRAGMA user_version=${next + 1}`)
        }
      })
    } catch (error) { this.db.close(); throw error }
  }
  /** Run a synchronous transaction; rollback leaves no partial business mutations.
   * @param action - Synchronous operation.
   * @returns Committed operation result.
   */
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = action(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  /** Read and validate a record at the durable boundary.
   * @param kind - Entity table.
   * @param key - Business id.
   * @returns Record or null.
   */
  get<K extends Kind>(kind: K, key: Id): Records[K] | null {
    const row = this.db.prepare(`SELECT data FROM ${kind} WHERE id=?`).get(key)
    return row ? schemas[kind].parse(JSON.parse(String(row.data))) as Records[K] : null
  }
  /** Require a record and optionally its exact revision.
   * @param kind - Entity table.
   * @param key - Business id.
   * @param revision - Expected revision when changing a record.
   * @returns Existing record; missing or stale records throw.
   */
  require<K extends Kind>(kind: K, key: Id, revision?: number): Records[K] {
    const value = this.get(kind, key)
    if (!value) throw new BusinessError('record_missing', 404)
    if (revision !== undefined && value.revision !== revision) throw new BusinessError('revision_conflict')
    return value
  }
  /** List validated records.
   * @param kind - Entity table.
   * @returns Records in insertion order.
   */
  list<K extends Kind>(kind: K): Records[K][] {
    return this.db.prepare(`SELECT data FROM ${kind} ORDER BY rowid`).all().map(row => schemas[kind].parse(JSON.parse(String(row.data))) as Records[K])
  }
  /** Persist a validated entity inside the caller's transaction.
   * @param kind - Entity table.
   * @param record - Complete next revision.
   * @returns Stored record.
   */
  put<K extends Kind>(kind: K, record: Records[K]): Records[K] {
    const parsed = schemas[kind].parse(record) as Records[K]
    this.db.prepare(`INSERT INTO ${kind}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(parsed.id, JSON.stringify(parsed))
    return parsed
  }
  /** Close this owner's SQLite connection. */
  close(): void { this.db.close() }
}
/** Create server-owned record metadata.
 * @param now - Explicit operation time.
 * @param key - Existing identity for a one-to-one record.
 * @returns Initial metadata.
 */
export function base(now: string, key: Id = id.parse(randomUUID())) { return { id: key, revision: 1, createdAt: now, updatedAt: now } }
