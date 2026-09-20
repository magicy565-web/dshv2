/** Mountable SQLite-backed draft and revision service for dsh profiles. */
import type { Context } from '@deepseek-ai/cordis'
import { isAbsolute } from 'node:path'
import { InMemorySiteService } from './memory.ts'
import { SqliteSiteStateStore } from './sqlite.ts'

/** Storage location supplied by the deployment's profile. */
export interface Config {
  /** Absolute filename of a dedicated site SQLite database; parent must exist. */
  readonly databasePath: string
}

/** Persist site edits and queued publication jobs under the Cordis service lifecycle. */
export class PersistentSiteService extends InMemorySiteService {
  /** Open storage, restore state, and bind connection cleanup to plugin disposal.
   * @param ctx - Owning plugin context.
   * @param config - Explicit deployment database location.
   */
  constructor(ctx: Context, config: Config) {
    if (typeof config.databasePath !== 'string' || !isAbsolute(config.databasePath)) throw new Error('site databasePath must be an absolute filename')
    const storage = new SqliteSiteStateStore(config.databasePath)
    try {
      super(ctx, undefined, storage)
    } catch (error) {
      storage.close()
      throw error
    }
    ctx.effect(() => () =>{  storage.close() })
  }
}

export default PersistentSiteService
