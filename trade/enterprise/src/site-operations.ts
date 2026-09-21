/** Private website monitoring and integration receipts; analytics remains owned by Umami. */
import { DatabaseSync } from 'node:sqlite'
import type { SiteService, SiteSpec, SiteId } from '../../../packages/site/site/src/index.ts'
import type { SitePublication } from './site-system.ts'
import { SiteHostingError } from './site-hosting.ts'
import { siteServices, type SiteServicesConfig } from './site-services.ts'
import { siteCitation, siteOperationsSettings } from './site-operations-schema.ts'

/** Owns only site operations; company records, tasks, source and Umami metrics keep their existing authorities. */
export class SiteOperations {
  private readonly db: DatabaseSync
  /** Purge local integration data; destination-owned deliveries are retained externally.
   * @param siteId - Identity from a durable site deletion receipt.
   */
  deleteSite(siteId: SiteId): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const table of ['settings', 'crawlers', 'observations', 'deliveries']) this.db.prepare(`DELETE FROM ${table} WHERE site_id=?`).run(siteId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private readonly services: ReturnType<typeof siteServices>
  private readonly activeDeliveries = new Set<string>()
  constructor(path: string, private readonly sites: SiteService, private readonly local: SitePublication, private readonly config: SiteServicesConfig) {
    this.services = siteServices(config)
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA busy_timeout=5000')
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== 1) { this.db.close(); throw new Error('Unsupported website operations database version') }
    try { if (version === 0) this.db.exec('BEGIN IMMEDIATE; CREATE TABLE settings(site_id TEXT PRIMARY KEY,version INTEGER NOT NULL,data TEXT NOT NULL,next_check INTEGER NOT NULL); CREATE TABLE crawlers(site_id TEXT NOT NULL,day TEXT NOT NULL,crawler TEXT NOT NULL,requests INTEGER NOT NULL,PRIMARY KEY(site_id,day,crawler)); CREATE TABLE observations(id INTEGER PRIMARY KEY,site_id TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE deliveries(inquiry_id TEXT NOT NULL,site_id TEXT NOT NULL,channel TEXT NOT NULL,state TEXT NOT NULL,reference TEXT,PRIMARY KEY(inquiry_id,channel)); PRAGMA user_version=1; COMMIT') }
    catch (error) { this.db.close(); throw error }
  }
  private owned(spec: SiteSpec) { if (!this.sites.get(spec)) throw new SiteHostingError(404, 'Site not found') }
  /** Read persisted switches and their optimistic version.
   * @param spec - Authorized website.
   * @returns Saved settings, or explicit defaults before the first save.
   */
  settings(spec: SiteSpec) {
    this.owned(spec)
    const row = this.db.prepare('SELECT version,data FROM settings WHERE site_id=?').get(spec.siteId)
    return { version: row ? Number(row.version) : 0, settings: siteOperationsSettings.parse(row ? JSON.parse(String(row.data)) : {}) }
  }
  /** Save configured integrations only when the observed settings version still matches.
   * @param spec - Authorized website.
   * @param expectedVersion - Version observed by the editor.
   * @param input - Untrusted per-site settings.
   * @returns Persisted settings and their new version.
   */
  configure(spec: SiteSpec, expectedVersion: number, input: unknown) {
    this.owned(spec)
    const settings = siteOperationsSettings.parse(input)
    if ((settings.notifications && !this.services.configured.notifications) || (settings.crm && !this.services.configured.crm) || (settings.monitor.enabled && !this.services.configured.search)) throw new SiteHostingError(422, 'Configure the selected self-hosted service first')
    if (settings.monitor.enabled && !settings.monitor.queries.length) throw new SiteHostingError(422, 'Add at least one monitoring query')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (this.settings(spec).version !== expectedVersion) throw new SiteHostingError(409, 'Settings changed; refresh before saving')
      this.db.prepare('INSERT INTO settings VALUES(?,?,?,0) ON CONFLICT(site_id) DO UPDATE SET version=excluded.version,data=excluded.data,next_check=0').run(spec.siteId, expectedVersion + 1, JSON.stringify(settings))
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.settings(spec)
  }
  /** Create or reconcile the website UUID in operator-owned Umami.
   * @param spec - Authorized website.
   * @param publicUrl - Reviewed publication URL.
   * @param signal - Request cancellation.
   * @returns Public tracker configuration without API credentials.
   */
  async provision(spec: SiteSpec, publicUrl: string, signal: AbortSignal) { this.owned(spec); return this.services.provision(spec.siteId, this.sites.get(spec)!.name, publicUrl, signal) }
  /** Aggregate recognized User-Agent claims without treating them as verified crawler identities.
   * @param spec - Authorized website.
   * @param userAgent - Untrusted request header.
   */
  recordCrawler(spec: SiteSpec, userAgent: string) {
    this.owned(spec)
    const crawler = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot', 'bingbot'].find(name => userAgent.toLowerCase().includes(name.toLowerCase()))
    if (!crawler) return
    this.db.prepare('INSERT INTO crawlers VALUES(?,?,?,1) ON CONFLICT(site_id,day,crawler) DO UPDATE SET requests=requests+1').run(spec.siteId, new Date().toISOString().slice(0, 10), crawler)
  }
  /** Retain independently labeled evidence in the private operations store.
   * @param spec - Authorized website.
   * @param kind - Evidence collection method.
   * @param data - Method-owned observation fields.
   */
  record(spec: SiteSpec, kind: 'search' | 'citation' | 'model', data: unknown) {
    this.owned(spec)
    this.db.prepare('INSERT INTO observations(site_id,kind,created_at,data) VALUES(?,?,?,?)').run(spec.siteId, kind, new Date().toISOString(), JSON.stringify(data))
  }
  /** Save a manual citation and identify links matching this published site.
   * @param spec - Authorized website.
   * @param input - Untrusted manual evidence.
   */
  citation(spec: SiteSpec, input: unknown) {
    const value = siteCitation.parse(input)
    if (Date.parse(value.observedAt) > Date.now()) throw new SiteHostingError(400, 'Observation time is in the future')
    const publicUrl = this.local.growth(spec).publicUrl
    if (!publicUrl) throw new SiteHostingError(409, 'Publish a website before recording citation evidence')
    const target = new URL(publicUrl)
    this.record(spec, 'citation', { ...value, source: 'manual', citedPages: value.citedUrls.filter(url => { const parsed = new URL(url); return parsed.origin === target.origin && parsed.pathname.startsWith(target.pathname) }) })
  }
  /** Observe configured search results; partial and failed requests remain distinguishable.
   * @param spec - Authorized website.
   * @param signal - Operation cancellation.
   */
  async monitor(spec: SiteSpec, signal: AbortSignal) {
    const { settings } = this.settings(spec)
    const published = this.local.growth(spec)
    if (!published.online || !published.publicUrl) throw new SiteHostingError(409, 'Publish a website before monitoring')
    const target = new URL(published.publicUrl)
    for (const query of settings.monitor.queries) {
      try {
        const result = await this.services.search(query, signal)
        this.record(spec, 'search', { query, publicUrl: published.publicUrl, source: 'searxng', status: result.unresponsive_engines?.length ? 'partial' : 'complete', matches: result.results.flatMap((item, index) => { const url = new URL(item.url); return url.origin === target.origin && url.pathname.startsWith(target.pathname) ? [{ ...item, position: index + 1 }] : [] }) })
      } catch (error) { if (signal.aborted) throw error; this.record(spec, 'search', { query, source: 'searxng', status: 'failed' }) }
    }
  }
  /** Claim an inquiry before external delivery; uncertain acceptance requires operator recovery.
   * @param spec - Authorized website.
   * @param id - Persisted inquiry identifier.
   * @param channel - Enabled destination.
   * @param signal - Operation cancellation.
   * @param reconcile - Only inspect existing CRM records without creating another.
   */
  async deliver(spec: SiteSpec, id: string, channel: 'notifications' | 'crm', signal: AbortSignal, reconcile = false) {
    this.owned(spec)
    const inquiry = this.local.inquiry(spec, id)
    const { settings } = this.settings(spec)
    if (!settings[channel]) throw new SiteHostingError(409, 'This delivery channel is disabled')
    const existing = this.db.prepare('SELECT state,reference FROM deliveries WHERE inquiry_id=? AND channel=?').get(id, channel)
    if (existing?.state === 'delivered') return
    if (existing && !reconcile) return
    if (reconcile) {
      if (channel !== 'crm') throw new SiteHostingError(409, 'Notification acceptance is uncertain; inspect the notification service')
      const reference = await this.services.findLead(id, signal)
      if (reference) this.db.prepare('UPDATE deliveries SET state=\'delivered\',reference=? WHERE inquiry_id=? AND channel=?').run(reference, id, channel)
      return
    }
    // A durable claim precedes the external write. Unknown acceptance is never retried automatically.
    const claim = this.db.prepare('INSERT OR IGNORE INTO deliveries VALUES(?,?,?,\'unknown\',NULL)').run(id, spec.siteId, channel)
    if (!claim.changes) return
    const key = `${id}:${channel}`
    this.activeDeliveries.add(key)
    try {
      const reference = channel === 'crm' ? (await this.services.findLead(id, signal) ?? await this.services.createLead(inquiry, signal)) : await this.services.notify(id, signal)
      this.db.prepare('UPDATE deliveries SET state=\'delivered\',reference=? WHERE inquiry_id=? AND channel=?').run(reference, id, channel)
    } catch (error) { if (signal.aborted) throw error }
    finally { this.activeDeliveries.delete(key) }
  }
  /** Retry explicitly confirmed uncertain delivery after any in-process request has settled.
   * @param spec - Authorized website.
   * @param id - Inquiry whose destination was checked by the operator.
   * @param channel - Enabled destination; notifications may be duplicated.
   * @param signal - Request cancellation.
   */
  async retryDelivery(spec: SiteSpec, id: string, channel: 'notifications' | 'crm', signal: AbortSignal) {
    this.owned(spec)
    this.local.inquiry(spec, id)
    if (!this.settings(spec).settings[channel]) throw new SiteHostingError(409, 'This delivery channel is disabled')
    if (this.activeDeliveries.has(`${id}:${channel}`)) throw new SiteHostingError(409, 'Delivery is still in progress')
    const removed = this.db.prepare('DELETE FROM deliveries WHERE site_id=? AND inquiry_id=? AND channel=? AND state=\'unknown\'').run(spec.siteId, id, channel)
    if (!removed.changes) throw new SiteHostingError(409, 'No uncertain delivery to retry')
    await this.deliver(spec, id, channel, signal)
  }
  /** Combine Umami-owned metrics with local receipts, preserving upstream failures.
   * @param spec - Authorized website.
   * @param days - Requested reporting window.
   * @param signal - Request cancellation.
   * @returns Recent evidence and independently counted metrics.
   */
  async report(spec: SiteSpec, days: number, signal: AbortSignal) {
    const now = Date.now(); const startAt = now - days * 86400000
    const growth = this.local.growth(spec)
    let traffic = null; let trafficError = false
    if (growth.analytics && this.services.configured.analytics) {
      try { traffic = await this.services.analytics(growth.analytics.websiteId, startAt, now, signal) }
      catch (error) { if (signal.aborted) throw error; trafficError = true }
    }
    return { ...this.settings(spec), configured: this.services.configured, analyticsConnected: Boolean(growth.analytics), traffic, trafficError, inquiries: this.local.inquiryCount(spec, startAt, now),
      crawlers: this.db.prepare('SELECT day,crawler,requests FROM crawlers WHERE site_id=? AND day>=? ORDER BY day DESC').all(spec.siteId, new Date(startAt).toISOString().slice(0, 10)),
      observations: this.db.prepare('SELECT id,kind,created_at,data FROM observations WHERE site_id=? ORDER BY id DESC LIMIT 100').all(spec.siteId).map(row => ({ id: Number(row.id), kind: String(row.kind), createdAt: String(row.created_at), data: JSON.parse(String(row.data)) as unknown })),
      deliveries: this.db.prepare('SELECT inquiry_id AS inquiryId,channel,state,reference FROM deliveries WHERE site_id=? ORDER BY rowid DESC LIMIT 100').all(spec.siteId) }
  }
  /** Claim due checks and pending deliveries under a bounded per-pass budget.
   * @param specs - Websites owned by this enterprise.
   * @param signal - Host shutdown cancellation.
   */
  async tick(specs: readonly SiteSpec[], signal: AbortSignal) {
    const oldest = new Date(Date.now() - this.config.retentionDays * 86400000).toISOString()
    this.db.prepare('DELETE FROM observations WHERE created_at<?').run(oldest)
    this.db.prepare('DELETE FROM crawlers WHERE day<?').run(oldest.slice(0, 10))
    let remaining = this.config.maxDeliveriesPerTick
    for (const spec of specs) {
      signal.throwIfAborted()
      const { settings } = this.settings(spec)
      if (settings.monitor.enabled && this.local.state(spec).online) {
        const claimed = this.db.prepare('UPDATE settings SET next_check=? WHERE site_id=? AND next_check<=?').run(Date.now() + settings.monitor.intervalHours * 3600000, spec.siteId, Date.now())
        if (claimed.changes) await this.monitor(spec, signal)
      }
      const claimed = new Set(this.db.prepare('SELECT inquiry_id,channel FROM deliveries WHERE site_id=?').all(spec.siteId).map(row => `${String(row.inquiry_id)}:${String(row.channel)}`))
      for (const id of this.local.inquiryIds(spec)) for (const channel of ['notifications', 'crm'] as const) if (remaining > 0 && settings[channel] && !claimed.has(`${id}:${channel}`)) { remaining--; await this.deliver(spec, id, channel, signal) }
    }
  }
  /** Delete local integration metadata; external copies remain destination-owned.
   * @param spec - Authorized website.
   * @param id - Deleted local inquiry identifier.
   */
  deleteInquiry(spec: SiteSpec, id: string) { this.owned(spec); this.db.prepare('DELETE FROM deliveries WHERE site_id=? AND inquiry_id=?').run(spec.siteId, id) }
  /** Delete only an observation owned by the authorized site.
   * @param spec - Authorized website.
   * @param id - Persisted observation identifier.
   */
  deleteObservation(spec: SiteSpec, id: number) { this.owned(spec); this.db.prepare('DELETE FROM observations WHERE site_id=? AND id=?').run(spec.siteId, id) }
  /** Close the database after all requests and background operations have drained.
   */
  close() { this.db.close() }
}
