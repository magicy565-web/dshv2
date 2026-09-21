/** Private website operations use persisted settings and independently labeled evidence. */
import { z } from 'zod'

/** Per-site switches require an authenticated operator; integration credentials stay on the Host. */
export const siteOperationsSettings = z.object({
  notifications: z.boolean().default(false), crm: z.boolean().default(false),
  monitor: z.object({ enabled: z.boolean().default(false), queries: z.array(z.string().trim().min(1).max(300)).max(10).default([]), intervalHours: z.number().int().min(1).max(720).default(24) }).prefault({}),
}).strict()
/** Manually collected public-model evidence is not represented as an automated model observation. */
export const siteCitation = z.object({ engine: z.string().trim().min(1).max(100), question: z.string().trim().min(1).max(2000), answer: z.string().trim().min(1).max(20000), evidenceUrl: z.url({ protocol: /^https?$/ }).refine(value => { const url = new URL(value); return !url.username && !url.password }), citedUrls: z.array(z.url({ protocol: /^https?$/ })).max(50), observedAt: z.iso.datetime() }).strict()
/** Service failures remain explicit in the UI instead of becoming zero counters. */
export const siteOperationsReport = z.object({
  settings: siteOperationsSettings, version: z.number().int(),
  configured: z.object({ analytics: z.boolean(), search: z.boolean(), notifications: z.boolean(), crm: z.boolean() }),
  analyticsConnected: z.boolean().default(false),
  traffic: z.object({ pageviews: z.number(), visitors: z.number(), visits: z.number(), startAt: z.number(), endAt: z.number(), sources: z.array(z.object({ x: z.string(), y: z.number() })), events: z.array(z.object({ x: z.string(), y: z.number() })) }).nullable(),
  sourceChanged: z.boolean().default(false), trafficError: z.boolean(), inquiries: z.number(),
  crawlers: z.array(z.object({ day: z.string(), crawler: z.string(), requests: z.number() })),
  observations: z.array(z.object({ id: z.number(), kind: z.enum(['search', 'citation', 'model']), createdAt: z.string(), data: z.record(z.string(), z.unknown()) })),
  deliveries: z.array(z.object({ inquiryId: z.string(), channel: z.string(), state: z.string(), reference: z.string().nullable() })),
})
