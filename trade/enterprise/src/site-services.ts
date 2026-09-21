/** Server-only adapters for self-hosted Umami, SearXNG, ntfy and EspoCRM. */
import { z } from 'zod'
import { siteIntegrationUrl } from './site-growth-schema.ts'
import { SiteHostingError } from './site-hosting.ts'

/** Credentials belong to deployment configuration and never enter website source or browser responses. */
export const siteServicesConfig = z.object({
  umami: z.object({ baseUrl: siteIntegrationUrl, publicUrl: siteIntegrationUrl, dashboardUrl: siteIntegrationUrl.optional(), apiKey: z.string().min(1) }).strict().optional(),
  search: z.object({ baseUrl: siteIntegrationUrl }).strict().optional(),
  notifications: z.object({ baseUrl: siteIntegrationUrl, topic: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100), token: z.string().min(1) }).strict().optional(),
  crm: z.object({ baseUrl: siteIntegrationUrl, apiKey: z.string().min(1) }).strict().optional(),
  requestTimeoutMs: z.number().int().positive().default(15000), maxResponseBytes: z.number().int().positive().default(2097152),
  pollIntervalMs: z.number().int().min(1000).default(60000), retentionDays: z.number().int().min(1).max(3650).default(90),
  maxDeliveriesPerTick: z.number().int().positive().default(50),
}).strict()
/** Resolved service endpoints and operation limits. */
export type SiteServicesConfig = z.infer<typeof siteServicesConfig>
const metrics = z.array(z.object({ x: z.string(), y: z.number().nonnegative() }))
const count = z.union([z.number().nonnegative(), z.object({ value: z.number().nonnegative() }).transform(value => value.value)])
const stats = z.object({ pageviews: count, visitors: count, visits: count })

/** Thin protocol adapters; HTTP responses remain bounded and redirects never carry service credentials.
 * @param config - Operator-owned self-hosted endpoints.
 * @returns Integration operations; failures never become fabricated zero metrics.
 */
export function siteServices(config: SiteServicesConfig) {
  const request = async (base: string, path: string, signal: AbortSignal, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(new URL(path, base.replace(/\/?$/, '/')), { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)]) })
    if (!response.ok) { await response.body?.cancel(); throw new SiteHostingError(response.status === 404 ? 404 : 502, `Integration request failed (${response.status})`) }
    const reader = response.body?.getReader()
    if (!reader) throw new SiteHostingError(502, 'Integration returned no response')
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > config.maxResponseBytes) { await reader.cancel(); throw new SiteHostingError(502, 'Integration response exceeds limit') }; chunks.push(chunk.value) }
    } finally { reader.releaseLock() }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  }
  const umami = async (path: string, signal: AbortSignal, body?: unknown) => {
    if (!config.umami) throw new SiteHostingError(503, 'Self-hosted Umami is not configured')
    return request(config.umami.baseUrl, path, signal, { headers: { authorization: `Bearer ${config.umami.apiKey}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) })
  }
  const crm = async (path: string, signal: AbortSignal, body?: unknown) => {
    if (!config.crm) throw new SiteHostingError(503, 'Self-hosted CRM is not configured')
    return request(config.crm.baseUrl, `api/v1/${path}`, signal, { headers: { 'X-Api-Key': config.crm.apiKey, 'content-type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) })
  }
  return {
    configured: { analytics: Boolean(config.umami), search: Boolean(config.search), notifications: Boolean(config.notifications), crm: Boolean(config.crm) },
    async provision(id: string, name: string, publicUrl: string, signal: AbortSignal) {
      if (!config.umami) throw new SiteHostingError(503, 'Self-hosted Umami is not configured')
      try { await umami(`api/websites/${id}`, signal) }
      catch (error) { if (!(error instanceof SiteHostingError) || error.status !== 404) throw error; await umami('api/websites', signal, { id, name, domain: new URL(publicUrl).hostname }) }
      const website = z.object({ id: z.string().uuid(), domain: z.string() }).parse(await umami(`api/websites/${id}`, signal))
      if (website.id !== id || website.domain !== new URL(publicUrl).hostname) throw new SiteHostingError(409, 'Umami website domain differs; update it in Umami before connecting')
      return { websiteId: id, scriptUrl: new URL('script.js', config.umami.publicUrl.replace(/\/?$/, '/')).href, dashboardUrl: new URL(`websites/${id}`, (config.umami.dashboardUrl ?? config.umami.publicUrl).replace(/\/?$/, '/')).href }
    },
    async analytics(id: string, startAt: number, endAt: number, signal: AbortSignal) {
      const range = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt) })
      const prefix = `api/websites/${id}`
      const [summary, sources, events] = await Promise.all([umami(`${prefix}/stats?${range}`, signal), umami(`${prefix}/metrics?${range}&type=referrer&limit=20`, signal), umami(`${prefix}/metrics?${range}&type=event&limit=20`, signal)])
      return { ...stats.parse(summary), sources: metrics.parse(sources), events: metrics.parse(events), startAt, endAt }
    },
    async search(query: string, signal: AbortSignal) {
      if (!config.search) throw new SiteHostingError(503, 'Self-hosted SearXNG is not configured')
      return z.object({ results: z.array(z.object({ title: z.string(), url: z.url({ protocol: /^https?$/ }), engine: z.string().optional() })).max(1000), unresponsive_engines: z.array(z.unknown()).optional() }).parse(await request(config.search.baseUrl, `search?${new URLSearchParams({ q: query, format: 'json' })}`, signal))
    },
    async notify(id: string, signal: AbortSignal) {
      if (!config.notifications) throw new SiteHostingError(503, 'Self-hosted notifications are not configured')
      return z.object({ id: z.string().min(1) }).parse(await request(config.notifications.baseUrl, '', signal, { method: 'POST', headers: { authorization: `Bearer ${config.notifications.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ topic: config.notifications.topic, title: 'Website inquiry received', message: `A website inquiry is waiting in the private workspace. Reference: ${id}` }) })).id
    },
    async findLead(id: string, signal: AbortSignal) {
      const filter = new URLSearchParams({ maxSize: '2', 'where[0][type]': 'contains', 'where[0][attribute]': 'description', 'where[0][value]': `site-inquiry:${id}` })
      const value = z.object({ list: z.array(z.object({ id: z.string() })) }).parse(await crm(`Lead?${filter}`, signal))
      if (value.list.length > 1) throw new SiteHostingError(409, 'Multiple CRM leads match this inquiry')
      return value.list[0]?.id
    },
    async createLead(inquiry: { id: string; name: string; email: string; company: string; message: string }, signal: AbortSignal) {
      return z.object({ id: z.string() }).parse(await crm('Lead', signal, { lastName: inquiry.name, emailAddress: inquiry.email, accountName: inquiry.company, description: `site-inquiry:${inquiry.id}\n${inquiry.message}` })).id
    },
  }
}
