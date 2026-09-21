/** Publication provider identities prevent saved remote ids and build formats from crossing providers. */
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SiteModuleId } from './site-system.ts'

const SCHEMA_VERSION = 1

/** Pin publication implementations independently of replaceable generation and rendering modules.
 * @param directory - Existing private enterprise data directory.
 * @param selected - Publication module and the configured cloud provider, when enabled.
 * @throws When persisted publication data belongs to another implementation; migration is required.
 */
export function bindSitePublicationModules(directory: string, selected: { publication: SiteModuleId; hosting?: SiteModuleId }): void {
  const database = new DatabaseSync(join(directory, 'site-module-bindings.sqlite'))
  try {
    database.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE')
    const version = database.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== SCHEMA_VERSION) throw new Error('Unsupported Site module bindings database version')
    if (version === 0) database.exec(`CREATE TABLE modules(kind TEXT PRIMARY KEY,id TEXT NOT NULL); PRAGMA user_version=${SCHEMA_VERSION}`)
    for (const kind of ['publication', 'hosting'] as const) {
      const id = selected[kind]
      if (id === undefined) continue
      const row = database.prepare('SELECT id FROM modules WHERE kind=?').get(kind)
      const legacyFile = kind === 'publication' ? 'site-local.sqlite' : 'site-hosting.sqlite'
      const previous = row?.id ?? (existsSync(join(directory, legacyFile)) ? (kind === 'publication' ? 'local@1' : 'vercel@1') : undefined)
      if (previous !== undefined && previous !== id) throw new Error(`Site ${kind} storage belongs to ${String(previous)}; migrate its data before selecting ${id}`)
      database.prepare('INSERT OR IGNORE INTO modules VALUES(?,?)').run(kind, id)
    }
    database.exec('COMMIT')
  } finally { database.close() }
}
