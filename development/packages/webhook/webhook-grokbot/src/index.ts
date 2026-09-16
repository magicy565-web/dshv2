/** Durable HTTP task bridge for Grokbot cloud-computer Routines. */
/* eslint-disable @stylistic/max-len -- compact protocol declarations keep the wire fields adjacent. */

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import z from 'zod'
import s from '@deepseek-ai/schemastery'

export type TaskStatus = 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'expired' | 'cancelled'
export interface GrokbotTask { readonly taskId: string; readonly workflowId: string; readonly nodeId: string; readonly idempotencyKey: string; readonly input: unknown; readonly allowedOrigins: readonly string[]; readonly expiresAt: string; readonly callbackToken: string; readonly attempt: number; readonly status: TaskStatus; readonly leaseExpiresAt?: string; readonly output?: unknown; readonly artifacts?: readonly ArtifactRef[]; readonly errorCode?: string; readonly finishedAt?: string }
export interface ArtifactRef { readonly url: string; readonly mimeType?: string; readonly name?: string }
export interface CreateTaskRequest { readonly workflowId: string; readonly nodeId: string; readonly idempotencyKey: string; readonly input: unknown; readonly allowedOrigins?: readonly string[]; readonly expiresAt: string }

export interface Config { readonly path: string; readonly authEnv: string; readonly maxBodyBytes: number; readonly leaseSeconds: number }
export const Config: s<Config> = s.object({ path: s.string().required(), authEnv: s.string().role('credential-ref').required(), maxBodyBytes: s.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(), leaseSeconds: s.number().step(1).min(5).max(3600).default(120) })

const taskSchema = z.object({
  taskId: z.string(), workflowId: z.string(), nodeId: z.string(), idempotencyKey: z.string(), input: z.unknown(),
  allowedOrigins: z.array(z.string()), expiresAt: z.string(), callbackToken: z.string(), attempt: z.number().int().nonnegative(),
  status: z.enum(['queued', 'leased', 'running', 'succeeded', 'failed', 'expired', 'cancelled']), leaseExpiresAt: z.string().optional(),
  output: z.unknown().optional(), artifacts: z.array(z.object({ url: z.string(), mimeType: z.string().optional(), name: z.string().optional() })).optional(), errorCode: z.string().optional(), finishedAt: z.string().optional(),
})
const taskDomain = defineDomain({ name: 'grokbot_task', version: 1, global: { schema: z.object({ tasks: z.array(taskSchema) }), initial: { tasks: [] as GrokbotTask[] } }, tables: {} })

declare module '@deepseek-ai/cordis' { interface Context { grokbotTasks: GrokbotTaskService } }

export class GrokbotTaskService extends Service {
  static inject = ['storageDomain', 'webServer', 'credentials']
  static Config = Config
  private readonly readyDomain: Promise<Domain<typeof taskDomain>>
  constructor(ctx: Context, config: Config) {
    super(ctx, 'grokbotTasks'); this.readyDomain = ctx.storageDomain.open(taskDomain)
    const ref = credentialRef(config.authEnv)
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: config.path, handler: this.handle.bind(this, ctx, config, ref) }), `grokbot: ${config.path}`)
    ctx.effect(() => async () => { await (await this.readyDomain).close() }, 'grokbotTasks.lifecycle')
  }
  private async domain(): Promise<Domain<typeof taskDomain>> { return this.readyDomain }
  async create(request: CreateTaskRequest): Promise<GrokbotTask> {
    if (!request.workflowId.trim() || !request.nodeId.trim() || !request.idempotencyKey.trim()) throw new TypeError('workflowId, nodeId, and idempotencyKey must be non-empty')
    if (!Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= Date.now()) throw new TypeError('expiresAt must be a future timestamp')
    const domain = await this.domain(); const current = domain.global.get(); const existing = current.tasks.find(task => task.idempotencyKey === request.idempotencyKey)
    if (existing !== undefined) return existing
    const task: GrokbotTask = { taskId: `grokbot-${randomUUID()}`, workflowId: request.workflowId, nodeId: request.nodeId, idempotencyKey: request.idempotencyKey, input: request.input, allowedOrigins: [...(request.allowedOrigins ?? [])], expiresAt: request.expiresAt, callbackToken: randomUUID(), attempt: 0, status: 'queued' }
    await domain.global.set({ tasks: [...current.tasks, task] }); return task
  }
  async get(taskId: string): Promise<GrokbotTask | undefined> { return (await this.domain()).global.get().tasks.find(task => task.taskId === taskId) }
  async claim(leaseSeconds: number): Promise<GrokbotTask | undefined> {
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 3600) throw new TypeError('leaseSeconds must be between 5 and 3600')
    const domain = await this.domain(); const now = Date.now(); const current = domain.global.get()
    const candidate = current.tasks.find(task => (task.status === 'queued' || (task.status === 'leased' && task.leaseExpiresAt !== undefined && Date.parse(task.leaseExpiresAt) <= now)) && Date.parse(task.expiresAt) > now)
    if (candidate === undefined) return undefined
    const claimed: GrokbotTask = { ...candidate, status: 'leased', attempt: candidate.attempt + 1, leaseExpiresAt: new Date(now + leaseSeconds * 1000).toISOString() }
    await domain.global.set({ tasks: current.tasks.map(task => task.taskId === candidate.taskId ? claimed : task) }); return claimed
  }
  async heartbeat(taskId: string, callbackToken: string, leaseSeconds: number): Promise<GrokbotTask> { const task = await this.authorize(taskId, callbackToken); if (task.status !== 'leased' && task.status !== 'running') throw new Error('task is not active'); const next = { ...task, status: 'running' as const, leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1000).toISOString() }; await (await this.domain()).global.set({ tasks: (await this.domain()).global.get().tasks.map(item => item.taskId === taskId ? next : item) }); return next }
  async complete(taskId: string, callbackToken: string, result: { status: 'succeeded' | 'failed'; output?: unknown; artifacts?: readonly ArtifactRef[]; errorCode?: string; attempt: number }): Promise<GrokbotTask> { const task = await this.authorize(taskId, callbackToken); if (result.attempt !== task.attempt) throw new Error('stale task attempt'); if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') return task; const { leaseExpiresAt: _lease, ...withoutLease } = task; const next: GrokbotTask = { ...withoutLease, status: result.status, ...(result.output === undefined ? {} : { output: result.output }), ...(result.artifacts === undefined ? {} : { artifacts: result.artifacts }), ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }), finishedAt: new Date().toISOString() }; const domain = await this.domain(); await domain.global.set({ tasks: domain.global.get().tasks.map(item => item.taskId === taskId ? next : item) }); return next }
  async cancel(taskId: string): Promise<boolean> { const domain = await this.domain(); const current = domain.global.get(); const task = current.tasks.find(item => item.taskId === taskId); if (task === undefined || ['succeeded', 'failed', 'cancelled'].includes(task.status)) return false; const { leaseExpiresAt: _lease, ...withoutLease } = task; await domain.global.set({ tasks: current.tasks.map(item => item.taskId === taskId ? { ...withoutLease, status: 'cancelled' as const } : item) }); return true }
  private async authorize(taskId: string, token: string): Promise<GrokbotTask> { const task = await this.get(taskId); if (task === undefined) throw new Error('task not found'); if (task.callbackToken !== token) throw new Error('invalid task token'); return task }
  private async handle(ctx: Context, config: Config, ref: CredentialRef, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestPath = new URL(req.url ?? '/', 'http://localhost').pathname.slice(config.path.length).replace(/^\//, '')
    if (req.method !== 'POST' && !(req.method === 'GET' && requestPath.startsWith('tasks/'))) { res.setHeader('allow', 'GET, POST'); json(res, 405, { error: 'method_not_allowed' }); return }
    const secret = (await ctx.credentials.resolve(ref))?.value; if (secret === undefined || secret === '') { json(res, 503, { error: 'credentials_unavailable' }); return }
    if (!validAuth(req.headers['x-grokbot-auth'] as string | undefined, secret)) { json(res, 401, { error: 'invalid_auth' }); return }
    if (req.method === 'GET') { json(res, 200, await this.get(requestPath.slice(6))); return }
    const chunks: Buffer[] = []; let bytes = 0; for await (const chunk of req) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string); bytes += value.length; if (bytes > config.maxBodyBytes) { json(res, 413, { error: 'body_too_large' }); return } chunks.push(value) }
    const raw = Buffer.concat(chunks).toString('utf8'); const path = requestPath
    if (path === 'callback' && !validSignature(raw, req.headers['x-grokbot-signature'] as string | undefined, secret)) { json(res, 401, { error: 'invalid_signature' }); return }
    try { const value = JSON.parse(raw) as Record<string, unknown>; if (path === 'create') { json(res, 201, await this.create(value as unknown as CreateTaskRequest)); return }; if (path === 'claim') { json(res, 200, { task: await this.claim(config.leaseSeconds) }); return }; if (path === 'heartbeat') { json(res, 200, await this.heartbeat(String(value.taskId), String(value.callbackToken), config.leaseSeconds)); return }; if (path === 'callback') { json(res, 200, await this.complete(String(value.taskId), String(value.callbackToken), value as never)); return }; if (path === 'cancel') { json(res, 200, { cancelled: await this.cancel(String(value.taskId)) }); return }; if (path.startsWith('tasks/')) { json(res, 200, await this.get(path.slice(6))); return }; json(res, 404, { error: 'not_found' }) } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : 'invalid_request' }) }
  }
}

function json(res: ServerResponse, status: number, value: unknown): void { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }
function signature(raw: string, secret: string): string { return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` }
function validSignature(raw: string, supplied: string | undefined, secret: string): boolean { if (supplied === undefined) return false; const expected = Buffer.from(signature(raw, secret)); const actual = Buffer.from(supplied); return expected.length === actual.length && timingSafeEqual(expected, actual) }
function validAuth(supplied: string | undefined, secret: string): boolean { if (supplied === undefined) return false; const expected = Buffer.from(secret); const actual = Buffer.from(supplied); return expected.length === actual.length && timingSafeEqual(expected, actual) }

export default GrokbotTaskService
