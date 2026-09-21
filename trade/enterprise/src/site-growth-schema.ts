/** Public website integrations travel with the reviewed source revision; no credentials belong here. */
import { z } from 'zod'

/** HTTP(S) integration URLs reject credentials, fragments and query-carried secrets. */
export const siteIntegrationUrl = z.url({ protocol: /^https?$/ }).refine(value => {
  const url = new URL(value)
  return !url.username && !url.password && !url.search && !url.hash
}, 'Use an HTTP(S) URL without credentials, query or fragment')

/** Self-hosted Umami uses its official browser tracker and private dashboard. */
export const siteGrowth = z.object({
  analytics: z.object({ scriptUrl: siteIntegrationUrl, websiteId: z.string().uuid(), dashboardUrl: siteIntegrationUrl }).strict().optional(),
  agent: z.boolean().default(false),
}).strict()
/** Resolved public integration settings. */
export type SiteGrowth = z.infer<typeof siteGrowth>

/** Optional acquisition context is visitor-reported, never proof of identity or a conversion. */
export const inquiryAttribution = z.object({
  landingPath: z.string().max(500), referrerHost: z.string().max(253),
  source: z.string().max(100), medium: z.string().max(100), campaign: z.string().max(100),
}).strict()

/** Public consultation accepts bounded visitor context, never workspace or Session identities. */
export const siteQuestion = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ question: z.string().max(2000), answer: z.string().max(12000) }).strict()).max(6).default([]),
}).strict()
