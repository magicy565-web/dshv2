/** Self-hosted static publication and a bounded private inquiry inbox; source code never runs on the Host. */
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SiteService, SiteSpec } from '../../../packages/site/site/src/index.ts'
import { SiteRevisionId, type SiteId } from '../../../packages/site/site/src/types.ts'
import { SiteHostingError } from './site-hosting.ts'
import { siteGrowth, siteQuestion, inquiryAttribution } from './site-growth-schema.ts'
import { siteCompanyContent } from './site-company-schema.ts'
import { discoverableHtml, siteSitemap, sitePagePath } from './site-discovery.ts'
import type { SiteConsultation, SiteAgentConfig } from './site-consultation.ts'

/** Deployment-owned publication and public intake quotas. */
export const siteLocalConfig = z.object({ maxPublicationBytes: z.number().int().positive().default(16777216), maxInquiryBytes: z.number().int().positive().default(16384), maxInquiriesPerHour: z.number().int().positive().default(60), maxStoredInquiries: z.number().int().positive().default(10000) }).strict()
/** Validated local publication quotas. */
export type SiteLocalConfig = z.infer<typeof siteLocalConfig>
const generation = z.number().int().nonnegative()
/** Exact build review required for local publication. */
export const localPublishCommand = z.object({ revisionId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), expectedGeneration: generation, confirmed: z.literal(true) }).strict()
/** Explicit offline request preserves both published bytes and inquiry records. */
export const localOfflineCommand = z.object({ expectedGeneration: generation, confirmed: z.literal(true) }).strict()
/** Inbox actions operate on an authenticated site's record. */
export const inquiryCommand = z.object({ id: z.string().uuid(), action: z.enum(['read', 'close', 'delete']) }).strict()
const publication = z.object({ generation, revisionId: z.string().uuid().nullable(), digest: z.string().nullable(), online: z.boolean() }).strict()
const staged = z.object({ revisionId: z.string().uuid(), digest: z.string(), pages: z.record(z.string(), z.string()), resources: z.record(z.string(), z.object({ content: z.string(), contentType: z.string() })).default({}), growth: siteGrowth.prefault({}), company: siteCompanyContent.optional(), publicUrl: z.string().optional() }).strict()
const inquiry = z.object({ requestId: z.string().regex(/^[a-f0-9]{32}$/), name: z.string().trim().min(1).max(160), email: z.email().max(254), company: z.string().trim().max(200), product: z.string().trim().max(5000), message: z.string().trim().min(10).max(5000), website: z.literal(''), consent: z.literal(true), attribution: inquiryAttribution.optional() }).strict()

/** Read bounded JSON at an untrusted HTTP boundary.
 * @param request - Request whose body is consumed once.
 * @param limit - Maximum encoded bytes.
 * @returns Parsed JSON, with explicit media and size failures.
 */
export async function readSiteJson(request: Request, limit: number): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new SiteHostingError(415, 'JSON is required')
  const reader = request.body?.getReader()
  if (!reader) throw new SiteHostingError(400, 'JSON is required')
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new SiteHostingError(413, 'Request exceeds the configured limit') }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new SiteHostingError(400, 'Invalid JSON') }
}

/** Persistent exact-build publication and inquiry reception owned by one enterprise editor. */
export class SiteLocal {
  private readonly db: DatabaseSync
  /** Purge deployment data after the source service has committed deletion.
   * @param siteId - Identity from a durable deletion receipt.
   */
  deleteSite(siteId: SiteId): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const table of ['publication', 'builds', 'inquiries', 'consultation_usage']) this.db.prepare(`DELETE FROM ${table} WHERE site_id=?`).run(siteId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  /** Open an independent database before registering HTTP routes.
   * @param path - Database path or :memory: for isolated fixtures.
   * @param sites - Source revision authority.
   * @param limits - Explicit publication and intake quotas.
   * @param consultant - Optional Harness consultation handler and deployment quotas.
   */
  constructor(path: string, private readonly sites: SiteService, private readonly limits: SiteLocalConfig, private readonly consultant?: { answer: SiteConsultation; config: SiteAgentConfig }) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE')
      const version = this.db.prepare('PRAGMA user_version').get()?.user_version
      if (version !== 0 && version !== 1 && version !== 2) throw new Error('Unsupported local Site database version')
      if (version === 0) this.db.exec('CREATE TABLE publication(site_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE builds(site_id TEXT NOT NULL, revision_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(site_id,revision_id)); CREATE TABLE inquiries(id TEXT PRIMARY KEY, site_id TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(site_id,request_id)); CREATE INDEX inbox_site_time ON inquiries(site_id,created_at); PRAGMA user_version=1')
      if (version !== 2) this.db.exec("ALTER TABLE builds RENAME TO old_builds; CREATE TABLE builds(site_id TEXT NOT NULL, digest TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(site_id,digest)); INSERT INTO builds SELECT site_id,json_extract(data,'$.digest'),data FROM old_builds; DROP TABLE old_builds; CREATE TABLE consultation_usage(site_id TEXT PRIMARY KEY, hour INTEGER NOT NULL, count INTEGER NOT NULL); PRAGMA user_version=2")
      this.db.exec('COMMIT')
    } catch (error) { this.db.close(); throw error }
  }
  /** Read publication state without exposing staged source.
   * @param spec - Authenticated site identity.
   * @returns Current pointer and public relative URL.
   */
  state(spec: SiteSpec) {
    if (!this.sites.get(spec)) throw new SiteHostingError(404, 'Site not found')
    const row = this.db.prepare('SELECT data FROM publication WHERE site_id=?').get(spec.siteId)
    const state = row ? publication.parse(JSON.parse(String(row.data))) : { generation: 0, revisionId: null, digest: null, online: false }
    return { ...state, url: `/sites-live/${spec.siteId}/` }
  }
  /** Compile every HTML page into saved browser-only bytes, without changing live routing.
   * @param spec - Authenticated site identity.
   * @param revisionId - Exact revision to review.
   * @param publicOrigin - Operator-configured origin, or the editor request origin for local use.
   * @returns Build identity and the observed publication generation.
   */
  async prepare(spec: SiteSpec, revisionId: SiteRevisionId, publicOrigin = 'http://localhost') {
    if (this.sites.get(spec)?.archived) throw new SiteHostingError(409, 'Restore the archived website before preparing publication')
    const state = this.state(spec)
    const artifact = this.sites.build(spec, revisionId)
    const read = (path: string) => {
      const file = artifact.files.find(file => file.path === path)
      return file ? JSON.parse(Buffer.from(file.base64, 'base64').toString('utf8')) as unknown : undefined
    }
    const growth = siteGrowth.parse(read('site.growth.json') ?? {})
    const company = siteCompanyContent.optional().parse(read('company.public.json'))
    if (growth.agent && (!company || !this.consultant)) throw new SiteHostingError(422, 'Configure the site Agent and include public company facts before publishing')
    const publicUrl = new URL(`/sites-live/${spec.siteId}/`, publicOrigin).href
    const pages: Record<string, string> = {}
    let bytes = 0
    for (const file of artifact.files.filter(file => file.contentType.startsWith('text/html'))) {
      const response = await this.sites.renderArtifact(artifact, `/${file.path}`, path => `/sites-live/${spec.siteId}${path}`, this.limits.maxPublicationBytes)
      const html = discoverableHtml(await response.text(), file.path, publicUrl, growth)
      bytes += Buffer.byteLength(html)
      if (bytes > this.limits.maxPublicationBytes) throw new SiteHostingError(413, 'Compiled website exceeds the publication limit')
      pages[file.path] = html
    }
    const resources = {
      'sitemap.xml': { content: await siteSitemap(Object.keys(pages), publicUrl), contentType: 'application/xml; charset=utf-8' },
      'robots.txt': { content: `User-agent: *\nAllow: /sites-live/${spec.siteId}/\nSitemap: ${publicUrl}sitemap.xml\n`, contentType: 'text/plain; charset=utf-8' },
      'llms.txt': { content: `# ${company?.name ?? this.sites.get(spec)!.name}\n\n${company?.description ?? ''}\n\n## Pages\n\n${Object.keys(pages).map(path => `- [${sitePagePath(path) || 'Home'}](${new URL(sitePagePath(path), publicUrl).href})`).join('\n')}\n`, contentType: 'text/plain; charset=utf-8' },
    }
    const payload = { revisionId, pages, resources, growth, ...(company ? { company } : {}), publicUrl }
    bytes = Buffer.byteLength(JSON.stringify(payload))
    if (bytes > this.limits.maxPublicationBytes) throw new SiteHostingError(413, 'Compiled website exceeds the publication limit')
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    const build = { ...payload, digest }
    this.sites.resolve(spec)
    if (this.sites.get(spec)?.archived) throw new SiteHostingError(409, 'Website was archived while preparing publication')
    this.db.prepare('INSERT OR IGNORE INTO builds VALUES(?,?,?)').run(spec.siteId, digest, JSON.stringify(build))
    return { revisionId, digest, expectedGeneration: state.generation, pageCount: Object.keys(pages).length, bytes, publicUrl, analytics: Boolean(growth.analytics), agent: growth.agent }
  }
  /** Publish only a prepared exact build and observed generation.
   * @param spec - Authenticated site identity.
   * @param input - Human-reviewed build identity.
   * @returns Committed publication state.
   */
  publish(spec: SiteSpec, input: z.infer<typeof localPublishCommand>) {
    if (this.sites.get(spec)?.archived) throw new SiteHostingError(409, 'Restore the archived website before publishing')
    const row = this.db.prepare('SELECT data FROM builds WHERE site_id=? AND digest=?').get(spec.siteId, input.digest)
    if (!row || staged.parse(JSON.parse(String(row.data))).revisionId !== input.revisionId) throw new SiteHostingError(409, 'Review this exact build before publishing')
    return this.change(spec, input.expectedGeneration, { revisionId: input.revisionId, digest: input.digest, online: true })
  }
  /** Stop serving pages and accepting new inquiries while retaining history.
   * @param spec - Authenticated site identity.
   * @param expectedGeneration - Observed publication generation.
   * @returns Committed offline state.
   */
  offline(spec: SiteSpec, expectedGeneration: number) { return this.change(spec, expectedGeneration, { online: false }) }
  private build(spec: SiteSpec) {
    const state = this.state(spec)
    if (!state.digest) return undefined
    const row = this.db.prepare('SELECT data FROM builds WHERE site_id=? AND digest=?').get(spec.siteId, state.digest)
    if (!row) throw new Error('Published Site build missing')
    return staged.parse(JSON.parse(String(row.data)))
  }
  /** Inspect published integrations and persisted inquiry totals without fabricating traffic counts.
   * @param spec - Authenticated website identity.
   * @returns Integration links, readiness and retained inquiry totals.
   */
  growth(spec: SiteSpec) {
    const state = this.state(spec)
    const build = this.build(spec)
    return { online: state.online, agentAvailable: Boolean(this.consultant), agent: build?.growth.agent ?? false, analytics: build?.growth.analytics ?? null, publicUrl: build?.publicUrl ?? null, inquiries: this.inbox(spec).total }
  }
  /** Published sitemap locations for the origin-level robots and sitemap handlers.
   * @param origin - Configured external origin.
   * @returns Online website sitemap URLs only.
   */
  sitemapUrls(origin: string): string[] {
    return this.db.prepare('SELECT site_id FROM publication WHERE json_extract(data,\'$.online\')=1').all().map(row => new URL(`/sites-live/${String(row.site_id)}/sitemap.xml`, origin).href)
  }
  private change(spec: SiteSpec, expected: number, changes: Partial<z.infer<typeof publication>>) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const state = this.state(spec)
      if (state.generation !== expected) throw new SiteHostingError(409, 'Publication changed; refresh before retrying')
      const { url: _url, ...prior } = state
      const next = publication.parse({ ...prior, ...changes, generation: expected + 1 })
      this.db.prepare('INSERT INTO publication VALUES(?,?) ON CONFLICT(site_id) DO UPDATE SET data=excluded.data').run(spec.siteId, JSON.stringify(next))
      this.db.exec('COMMIT')
      return { ...next, url: state.url }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  /** Fetch a bounded private inbox; inquiries never enter public page responses.
   * @param spec - Authenticated site identity.
   * @returns The newest 100 records and total count.
   */
  inbox(spec: SiteSpec) {
    this.state(spec)
    return { total: Number(this.db.prepare('SELECT count(*) AS count FROM inquiries WHERE site_id=?').get(spec.siteId)?.count), items: this.db.prepare('SELECT id,created_at,status,data FROM inquiries WHERE site_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(spec.siteId).map(row => ({ id: String(row.id), createdAt: new Date(Number(row.created_at)).toISOString(), status: z.enum(['received', 'read', 'closed']).parse(row.status), ...inquiry.parse(JSON.parse(String(row.data))) })) }
  }
  /** Read one private inquiry for an authenticated task or CRM operation.
   * @param spec - Authenticated website identity.
   * @param id - Received inquiry identifier.
   * @returns The persisted inquiry; another website's identifier is refused.
   */
  inquiry(spec: SiteSpec, id: string) {
    this.state(spec)
    const row = this.db.prepare('SELECT data FROM inquiries WHERE site_id=? AND id=?').get(spec.siteId, id)
    if (!row) throw new SiteHostingError(404, 'Inquiry not found')
    return { id, ...inquiry.parse(JSON.parse(String(row.data))) }
  }
  /** Count durable receipts within the same time window as traffic reporting.
   * @param spec - Authenticated website identity.
   * @param from - Inclusive epoch milliseconds.
   * @param to - Inclusive epoch milliseconds.
   * @returns Retained receipt count, including records marked read or closed.
   */
  inquiryCount(spec: SiteSpec, from: number, to: number) { this.state(spec); return Number(this.db.prepare('SELECT count(*) AS total FROM inquiries WHERE site_id=? AND created_at>=? AND created_at<=?').get(spec.siteId, from, to)?.total) }
  /** Enumerate retained receipt identities for a durable integration consumer.
   * @param spec - Authenticated website identity.
   * @returns Oldest-first ids without copying private message bodies.
   */
  inquiryIds(spec: SiteSpec) { this.state(spec); return this.db.prepare('SELECT id FROM inquiries WHERE site_id=? ORDER BY created_at,id').all(spec.siteId).map(row => String(row.id)) }
  /** Update or erase one site's private inquiry.
   * @param spec - Authenticated site identity.
   * @param command - Inbox record and requested action.
   * @returns Whether the addressed record existed.
   */
  updateInquiry(spec: SiteSpec, command: z.infer<typeof inquiryCommand>) {
    this.state(spec)
    const result = command.action === 'delete' ? this.db.prepare('DELETE FROM inquiries WHERE site_id=? AND id=?').run(spec.siteId, command.id) : this.db.prepare('UPDATE inquiries SET status=? WHERE site_id=? AND id=?').run(command.action === 'read' ? 'read' : 'closed', spec.siteId, command.id)
    if (!result.changes) throw new SiteHostingError(404, 'Inquiry not found')
    return { updated: true }
  }
  /** Serve compiled pages or receive public submissions for an online site.
   * @param spec - Deployment tenant and parsed public site id; existence is checked here.
   * @param path - Decoded path within the public site.
   * @param request - Unauthenticated visitor request.
   * @returns Sandboxed page or receipt; no source or inbox listing is public.
   */
  async fetch(spec: SiteSpec, path: string, request: Request): Promise<Response> {
    const json = (value: unknown, status: number) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' } })
    try {
      const state = this.state(spec)
      if (!state.online || !state.revisionId) return json({ error: 'Website unavailable' }, 404)
      const build = this.build(spec)!
      if (path === '/_consult') {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } })
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
        if (!build.growth.agent || !build.company || !this.consultant) return json({ error: 'Consultation unavailable' }, 503)
        const input = siteQuestion.parse(await readSiteJson(request, this.consultant.config.maxRequestBytes))
        const hour = Math.floor(Date.now() / 3600000)
        const allowance = this.db.prepare('INSERT INTO consultation_usage VALUES(?,?,1) ON CONFLICT(site_id) DO UPDATE SET hour=excluded.hour,count=CASE WHEN hour=excluded.hour THEN count+1 ELSE 1 END WHERE hour<>excluded.hour OR count<? RETURNING count').get(spec.siteId, hour, this.consultant.config.maxQuestionsPerHour)
        if (!allowance) return json({ error: 'Consultation limit reached; use the inquiry form' }, 429)
        try {
          const answer = await this.consultant.answer(build.company, input, request.signal)
          const current = this.state(spec)
          if (!current.online || current.digest !== state.digest) return json({ error: 'Website publication changed; please reload' }, 409)
          return json({ answer }, 200)
        } catch { return json({ error: 'Consultation unavailable; use the inquiry form' }, 503) }
      }
      if (path === '/_inquiries') {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' } })
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
        const input = inquiry.parse(await readSiteJson(request, this.limits.maxInquiryBytes))
        request.signal.throwIfAborted()
        this.db.exec('BEGIN IMMEDIATE')
        try {
          // The publication check shares the write lock with receipt creation, including across processes.
          if (!this.state(spec).online) throw new SiteHostingError(404, 'Website unavailable')
          const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
          const prior = this.db.prepare('SELECT id,fingerprint FROM inquiries WHERE site_id=? AND request_id=?').get(spec.siteId, input.requestId)
          if (prior && prior.fingerprint !== fingerprint) throw new SiteHostingError(409, 'Inquiry retry content changed')
          if (prior) { this.db.exec('COMMIT'); return json({ id: String(prior.id), status: 'received' }, 200) }
          const now = Date.now()
          const counts = this.db.prepare('SELECT count(*) AS total,coalesce(sum(created_at>=?),0) AS recent FROM inquiries WHERE site_id=?').get(now - 3600000, spec.siteId)!
          if (Number(counts.total) >= this.limits.maxStoredInquiries || Number(counts.recent) >= this.limits.maxInquiriesPerHour) throw new SiteHostingError(429, 'Inquiry capacity reached; contact the company directly')
          const id = randomUUID()
          this.db.prepare('INSERT INTO inquiries VALUES(?,?,?,?,?,?,?)').run(id, spec.siteId, input.requestId, fingerprint, now, 'received', JSON.stringify(input))
          this.db.exec('COMMIT')
          return json({ id, status: 'received' }, 201)
        } catch (error) { this.db.exec('ROLLBACK'); throw error }
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405)
      if (build.digest !== state.digest) throw new Error('Published Site digest mismatch')
      const relative = path.replace(/^\//, '')
      const resource = build.resources[relative]
      if (resource) return new Response(request.method === 'HEAD' ? null : resource.content, { headers: { 'content-type': resource.contentType, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } })
      const html = [relative, `${relative.replace(/\/$/, '')}/index.html`.replace(/^\//, ''), `${relative}.html`].map(key => build.pages[key]).find(value => value !== undefined)
      if (html === undefined) return json({ error: 'Page not found' }, 404)
      const analyticsOrigin = build.growth.analytics ? new URL(build.growth.analytics.scriptUrl).origin : ''
      const endpoint = new URL(request.url).origin + `/sites-live/${spec.siteId}`
      return new Response(request.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'content-security-policy': `sandbox allow-scripts allow-forms; default-src 'none'; script-src 'unsafe-inline' blob: data: ${analyticsOrigin}; style-src 'unsafe-inline'; img-src https: data: blob:; font-src data:; media-src https: data: blob:; connect-src ${endpoint}/_inquiries ${build.growth.agent ? `${endpoint}/_consult` : ''} ${analyticsOrigin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } })
    } catch (error) { return json({ error: error instanceof SiteHostingError ? error.message : error instanceof z.ZodError ? 'Invalid inquiry' : 'Site request failed' }, error instanceof SiteHostingError ? error.status : error instanceof z.ZodError ? 400 : 500) }
  }
  /** Close only after the owning route dispatcher drains active requests. */
  close() { this.db.close() }
}
