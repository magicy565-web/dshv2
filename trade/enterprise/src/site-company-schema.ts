/** Public website content reviewed independently of the private enterprise profile. */
import { z } from 'zod'

const text = z.string().trim().min(1).max(5000)
/** Reviewed, portable company content contains no private document paths. */
export const siteCompanyContent = z.object({
  name: text, description: text, business: z.string().max(3000),
  email: z.union([z.literal(''), z.email()]), phone: z.string().max(100), address: z.string().max(1000),
  products: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/).max(100), name: text, description: text,
    applications: z.array(text).max(30), specifications: z.array(z.object({ name: text, value: text }).strict()).max(100),
    customers: z.array(text).max(30).default([]), differences: z.array(text).max(30).default([]), limitations: z.array(text).max(30).default([]),
    evidence: z.array(z.object({ title: text, citation: text, url: z.url({ protocol: /^https?$/ }).optional() }).strict()).max(100).default([]),
  }).strict()).max(100),
  qualifications: z.array(text).max(100),
  pages: z.array(z.object({ kind: z.enum(['industry', 'solution', 'case', 'comparison']), slug: z.string().regex(/^[a-z0-9-]+$/).max(100), title: text, summary: text, sections: z.array(z.object({ title: text, body: text }).strict()).min(1).max(30), sources: z.array(z.object({ title: text, url: z.url({ protocol: /^https?$/ }) }).strict()).max(30).default([]) }).strict()).max(50).default([]),
}).strict()
/** Validated public company content, detached from its source records. */
export type SiteCompanyContent = z.infer<typeof siteCompanyContent>
/** UI review binds creation to this exact projection. */
export const siteCompanyReview = z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/), content: siteCompanyContent.nullable(), issues: z.array(z.string()), inquiryEndpoint: z.string().nullable(), agentAvailable: z.boolean().optional() })
