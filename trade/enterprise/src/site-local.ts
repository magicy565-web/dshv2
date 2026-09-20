/** Self-hosted static publication and a bounded private inquiry inbox; source code never runs on the Host. */
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SiteService, SiteSpec } from '../../../packages/site/site/src/index.ts'
import { SiteRevisionId } from '../../../packages/site/site/src/types.ts'
import { renderStaticPreview } from '../../../packages/site/site/src/preview.ts'
import { SiteHostingError } from './site-hosting.ts'

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
const staged = z.object({ revisionId: z.string().uuid(), digest: z.string(), pages: z.record(z.string(), z.string()) }).strict()
const inquiry = z.object({ requestId: z.string().regex(/^[a-f0-9]{32}$/), name: z.string().trim().min(1).max(160), email: z.email().max(254), company: z.string().trim().max(200), product: z.string().trim().max(5000), message: z.string().trim().min(10).max(5000), website: z.literal(''), consent: z.literal(true) }).strict()

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
  /** Open an independent database before registering HTTP routes.
   * @param path - Database path or :memory: for isolated fixtures.
   * @param sites - Source revision authority.
   * @param limits - Explicit publication and intake quotas.
   */
  constructor(path: string, private readonly sites: SiteService, private readonly limits: SiteLocalConfig) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE')
      const version = this.db.prepare('PRAGMA user_version').get()?.user_version
      if (version !== 0 && version !== 1) throw new Error('Unsupported local Site database version')
      if (version === 0) this.db.exec('CREATE TABLE publication(site_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE builds(site_id TEXT NOT NULL, revision_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(site_id,revision_id)); CREATE TABLE inquiries(id TEXT PRIMARY KEY, site_id TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(site_id,request_id)); CREATE INDEX inbox_site_time ON inquiries(site_id,created_at); PRAGMA user_version=1')
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
   * @returns Build identity and the observed publication generation.
   */
  async prepare(spec: SiteSpec, revisionId: SiteRevisionId) {
    const state = this.state(spec)
    const artifact = this.sites.build(spec, revisionId)
    const pages: Record<string, string> = {}
    let bytes = 0
    for (const file of artifact.files.filter(file => file.contentType.startsWith('text/html'))) {
      const response = await renderStaticPreview(artifact, `/${file.path}`, path => `/sites-live/${spec.siteId}${path}`, this.limits.maxPublicationBytes)
      const html = await response.text()
      bytes += Buffer.byteLength(html)
      if (bytes > this.limits.maxPublicationBytes) throw new SiteHostingError(413, 'Compiled website exceeds the publication limit')
      pages[file.path] = html
    }
    const build = { revisionId, digest: artifact.digest, pages }
    this.db.prepare('INSERT INTO builds VALUES(?,?,?) ON CONFLICT(site_id,revision_id) DO UPDATE SET data=excluded.data').run(spec.siteId, revisionId, JSON.stringify(build))
    return { revisionId, digest: artifact.digest, expectedGeneration: state.generation, pageCount: Object.keys(pages).length, bytes }
  }
  /** Publish only a prepared exact build and observed generation.
   * @param spec - Authenticated site identity.
   * @param input - Human-reviewed build identity.
   * @returns Committed publication state.
   */
  publish(spec: SiteSpec, input: z.infer<typeof localPublishCommand>) {
    const row = this.db.prepare('SELECT data FROM builds WHERE site_id=? AND revision_id=?').get(spec.siteId, input.revisionId)
    if (!row || staged.parse(JSON.parse(String(row.data))).digest !== input.digest) throw new SiteHostingError(409, 'Review this exact build before publishing')
    return this.change(spec, input.expectedGeneration, { revisionId: input.revisionId, digest: input.digest, online: true })
  }
  /** Stop serving pages and accepting new inquiries while retaining history.
   * @param spec - Authenticated site identity.
   * @param expectedGeneration - Observed publication generation.
   * @returns Committed offline state.
   */
  offline(spec: SiteSpec, expectedGeneration: number) { return this.change(spec, expectedGeneration, { online: false }) }
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
      const row = this.db.prepare('SELECT data FROM builds WHERE site_id=? AND revision_id=?').get(spec.siteId, state.revisionId)
      if (!row) throw new Error('Published Site build missing')
      const build = staged.parse(JSON.parse(String(row.data)))
      if (build.digest !== state.digest) throw new Error('Published Site digest mismatch')
      const relative = path.replace(/^\//, '')
      const html = [relative, `${relative.replace(/\/$/, '')}/index.html`.replace(/^\//, ''), `${relative}.html`].map(key => build.pages[key]).find(value => value !== undefined)
      if (html === undefined) return json({ error: 'Page not found' }, 404)
      return new Response(request.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': `sandbox allow-scripts allow-forms; default-src 'none'; script-src 'unsafe-inline' blob: data:; style-src 'unsafe-inline'; img-src https: data: blob:; font-src data:; media-src https: data: blob:; connect-src ${new URL(request.url).origin}/sites-live/${spec.siteId}/_inquiries; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } })
    } catch (error) { return json({ error: error instanceof SiteHostingError ? error.message : error instanceof z.ZodError ? 'Invalid inquiry' : 'Site request failed' }, error instanceof SiteHostingError ? error.status : error instanceof z.ZodError ? 400 : 500) }
  }
  /** Close only after the owning route dispatcher drains active requests. */
  close() { this.db.close() }
}
