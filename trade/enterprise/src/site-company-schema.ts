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
  }).strict()).max(100),
  qualifications: z.array(text).max(100),
}).strict()
/** Validated public company content, detached from its source records. */
export type SiteCompanyContent = z.infer<typeof siteCompanyContent>
/** UI review binds creation to this exact projection. */
export const siteCompanyReview = z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/), content: siteCompanyContent.nullable(), issues: z.array(z.string()), inquiryEndpoint: z.string().nullable() })
