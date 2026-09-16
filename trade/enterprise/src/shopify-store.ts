import type { DatabaseSync } from 'node:sqlite'
import { storeConnection, publishJob, type StoreConnection, type PublishJob, type PublishAttempt } from './shopify-site.ts'

/** Persist tenant-local Shopify connections and idempotent publication jobs. */
export function shopifyStore(db: DatabaseSync) {
  const connections = (): StoreConnection[] => db.prepare('SELECT data FROM shopify_connections ORDER BY rowid DESC').all().map(row => storeConnection(JSON.parse(String(row.data))))
  const jobs = (): PublishJob[] => db.prepare('SELECT data FROM shopify_publish_jobs ORDER BY rowid DESC').all().map(row => publishJob(JSON.parse(String(row.data))))
  const saveConnection = (value: StoreConnection): StoreConnection => { db.prepare('INSERT INTO shopify_connections(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, JSON.stringify(value)); return value }
  const saveJob = (value: PublishJob): PublishJob => { db.prepare('INSERT INTO shopify_publish_jobs(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, JSON.stringify(value)); return value }
  const saveToken = (connectionId: string, encryptedToken: string): void => { db.prepare('INSERT INTO shopify_credentials(connection_id,token) VALUES(?,?) ON CONFLICT(connection_id) DO UPDATE SET token=excluded.token').run(connectionId, encryptedToken) }
  const token = (connectionId: string): string | null => { const row = db.prepare('SELECT token FROM shopify_credentials WHERE connection_id=?').get(connectionId); return row ? String(row.token) : null }
  const event = (id: string, shopDomain: string, topic: string, payload: string, receivedAt: string): boolean => {
    try { db.prepare('INSERT INTO shopify_webhook_events(id,shop_domain,topic,payload,received_at) VALUES(?,?,?,?,?)').run(id, shopDomain, topic, payload, receivedAt); return true }
    catch (error) { if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) return false; throw error }
  }
  const attempts = (jobId: string): PublishAttempt[] => db.prepare('SELECT data FROM shopify_publish_attempts WHERE job_id=? ORDER BY attempt').all(jobId).map(row => JSON.parse(String(row.data)) as PublishAttempt)
  const saveAttempt = (value: PublishAttempt): PublishAttempt => { db.prepare('INSERT INTO shopify_publish_attempts(job_id,attempt,data) VALUES(?,?,?) ON CONFLICT(job_id,attempt) DO UPDATE SET data=excluded.data').run(value.jobId, value.attempt, JSON.stringify(value)); return value }
  return { connections, jobs, attempts, saveAttempt, saveConnection, saveJob, saveToken, token, event, findConnection: (id: string) => connections().find(value => value.id === id) ?? null, findJob: (id: string) => jobs().find(value => value.id === id) ?? null, findJobByKey: (key: string) => jobs().find(value => value.idempotencyKey === key) ?? null }
}
