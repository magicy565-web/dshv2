/** Authenticated HTTP handlers shared by Next.js and request-level tests. */
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { commandSchema, id } from './schema.ts'
import type { Principal } from './schema.ts'
import { BusinessError } from './database.ts'
import { CommerceService } from './service.ts'
import type { AgentGateway } from './runtime.ts'
import type { ShopifyGateway } from './shopify.ts'
import type { EnterpriseLink } from './enterprise-link.ts'
import type { EnterpriseStore } from './enterprise-store.ts'
import { embeddedRequest } from './embedded-wire.ts'

/** Server-owned credential mapping; role cannot come from a request body. */
export const credentialsSchema = z.array(z.object({ token: z.string().min(32), role: z.enum(['factory', 'factory-agent', 'merchant', 'merchant-agent']), subjectId: id }).strict()).refine(values => new Set(values.map(v => v.token)).size === values.length, 'Credentials must be distinct')
/** Handler dependencies make transports testable without binding a port. */
export interface HttpDependencies { service: CommerceService; credentials: z.infer<typeof credentialsSchema>; maxBodyBytes: number; agent?: AgentGateway; shopify?: ShopifyGateway; enterprise?: EnterpriseLink; enterpriseStore?: EnterpriseStore }
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const target = z.object({ id, expectedRevision: z.number().int().positive() }).strict()
const equals = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Resolve a bearer credential without accepting caller-selected roles.
 * @param credentials - Server-owned credential bindings.
 * @param authorization - Incoming Authorization header.
 * @returns Matching principal or undefined.
 */
export function authenticate(credentials: z.infer<typeof credentialsSchema>, authorization: string | null): Principal | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const credential = credentials.find(c => equals(authorization.slice(7), c.token))
  return credential ? { role: credential.role, subjectId: credential.subjectId } : undefined
}

/** Buffer bounded JSON for business and MCP requests.
 * @param request - Incoming request whose body is consumed once.
 * @param limit - Maximum body bytes.
 * @returns Parsed, untrusted JSON; invalid or oversized bodies throw.
 */
export async function readBody(request: Request, limit: number): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new BusinessError('json_required', 415)
  const reader = request.body?.getReader(); if (!reader) throw new BusinessError('body_required', 400)
  let length = 0; const parts: Uint8Array[] = []
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > limit) { await reader.cancel(); throw new BusinessError('body_too_large', 413) } parts.push(chunk.value) } }
  finally { reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown } catch { throw new BusinessError('invalid_json', 400) }
}

/** Process a role-scoped request; unsupported public browsing routes do not exist.
 * @param dependencies - Business service and configured capabilities.
 * @returns Web Request handler.
 */
export function handler(dependencies: HttpDependencies) {
  const credentials = credentialsSchema.parse(dependencies.credentials)
  return async (request: Request): Promise<Response> => {
    try {
      let path = new URL(request.url).pathname
      const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
      let embeddedActor: Principal | undefined
      if (path === '/api/integration/dispatch' && request.method === 'POST' && dependencies.enterprise) {
        if (request.headers.has('origin') || !equals(token, dependencies.enterprise.config.token)) throw new BusinessError('unauthorized', 401)
        const command = embeddedRequest.parse(await readBody(request, dependencies.maxBodyBytes))
        embeddedActor = dependencies.enterprise.actor(command.role)
        path = `/api/${command.route}`
        request = new Request(new URL(path, request.url), { method: command.method, signal: request.signal, ...(command.method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(command.body) } : {}) })
      }
      if (path === '/api/integration/exchange' && request.method === 'POST' && dependencies.enterprise) {
        const { code } = z.object({ code: z.string().min(32).max(100) }).strict().parse(await readBody(request, dependencies.maxBodyBytes))
        return response(dependencies.enterprise.exchange(code))
      }
      if (['/api/integration/open', '/api/integration/resume'].includes(path) && request.method === 'POST' && dependencies.enterprise) {
        if (!equals(token, dependencies.enterprise.config.token)) throw new BusinessError('unauthorized', 401)
        const body = await readBody(request, dependencies.maxBodyBytes)
        if (path.endsWith('/resume')) { const { role } = z.object({ role: z.enum(['factory', 'merchant']).default('factory') }).strict().parse(body); return response(dependencies.enterprise.resume(role)) }
        return response(dependencies.enterprise.open(body))
      }
      if (!credentials.length && !dependencies.enterprise) throw new BusinessError('credentials_not_configured', 503)
      const credential = embeddedActor ?? authenticate(credentials, request.headers.get('authorization')) ?? dependencies.enterprise?.authenticate(token)
      if (!credential) throw new BusinessError('unauthorized', 401)
      const actor: Principal = { role: credential.role, subjectId: credential.subjectId }
      if (request.method === 'GET') {
        if (path === '/api/workspace') return response({ ...dependencies.service.snapshot(actor), enterpriseLink: dependencies.enterprise?.status(actor) ?? null, storeLink: dependencies.enterpriseStore?.status(actor) ?? null, runtimeConfigured: Boolean(dependencies.agent) })
        if (path === '/api/manifest') return response({ version: 1, commands: z.toJSONSchema(commandSchema), modes: { READ: ['workspace', 'shopify.catalog'], DRAFT: ['agent', 'commands', 'shopify.draft'], EXECUTE: ['shopify.publish'] } })
        if (path === '/api/products/readiness') {
          const key = id.parse(new URL(request.url).searchParams.get('id')), product = dependencies.service.store.require('product', key)
          if (!actor.role.startsWith('factory') || product.companyId !== actor.subjectId) throw new BusinessError('forbidden', 403)
          return response(dependencies.service.readiness(key))
        }
        throw new BusinessError('not_found', 404)
      }
      if (request.method !== 'POST') throw new BusinessError('method_not_allowed', 405)
      const body = await readBody(request, dependencies.maxBodyBytes)
      if (path === '/api/integration/logout') { z.object({}).strict().parse(body); dependencies.enterprise?.logout(token); return response({ ok: true }) }
      if (path === '/api/commands') return response(dependencies.service.execute(actor, body))
      if (path === '/api/agent' || path === '/api/agent/apply' || path === '/api/agent/check') {
        if (!dependencies.agent) throw new BusinessError('runtime_not_configured', 503)
        if (path.endsWith('/check')) { z.object({}).strict().parse(body); return response(await dependencies.agent.check()) }
        return response(path.endsWith('/apply') ? dependencies.agent.apply(actor, body) : await dependencies.agent.run(actor, body))
      }
      if (path.startsWith('/api/shopify/')) {
        if (!dependencies.shopify) throw new BusinessError('shopify_not_configured', 503)
        if (!actor.role.startsWith('merchant')) throw new BusinessError('forbidden', 403)
        if (['/api/shopify/stores', '/api/shopify/publications', '/api/shopify/select'].includes(path)) {
          if (!dependencies.enterpriseStore) throw new BusinessError('shopify_not_connected', 503)
          if (path.endsWith('/stores')) { z.object({}).strict().parse(body); return response(await dependencies.enterpriseStore.stores(actor.subjectId)) }
          if (path.endsWith('/publications')) { const c = z.object({ connectionId: z.string().min(1).max(120) }).strict().parse(body); return response(await dependencies.enterpriseStore.publications(actor.subjectId, c.connectionId)) }
          return response(await dependencies.enterpriseStore.select(actor, body))
        }
        if (path === '/api/shopify/catalog') { z.object({}).strict().parse(body); return response(await dependencies.shopify.resolve(actor.subjectId).readCatalog()) }
        if (path === '/api/shopify/draft') { const c = target.parse(body); return response(await dependencies.shopify.draft(actor, c.id, c.expectedRevision)) }
        if (path === '/api/shopify/publish' || path === '/api/shopify/reconcile') { const c = z.object({ id }).strict().parse(body); return response(await dependencies.shopify.publish(actor, c.id, path.endsWith('/reconcile'))) }
      }
      throw new BusinessError('not_found', 404)
    } catch (error) {
      if (error instanceof z.ZodError) return response({ error: 'validation_failed', fields: error.issues.map(i => i.path.join('.')) }, 400)
      if (error instanceof BusinessError) return response({ error: error.code }, error.status)
      return response({ error: 'operation_failed' }, 500)
    }
  }
}
