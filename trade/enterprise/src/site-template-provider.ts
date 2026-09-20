/** Manufacturing content schema and installed template version, independent of editor and model inputs. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SiteTemplateProvider } from '../../../packages/site/site/src/template-types.ts'
import type { SiteTemplateId } from '../../../packages/site/site/src/template-types.ts'
import { manufacturingProject } from './site-manufacturing.ts'

/** Stable identity of the bundled manufacturing provider. */
export const manufacturingTemplateId = brandString<SiteTemplateId>('manufacturing')
/** Pinned rendering and input-schema version; existing projects never follow a latest alias. */
export const manufacturingTemplateVersion = '1.0.0'

const productSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  title: z.string().trim().min(1).max(100), type: z.string().trim().min(1).max(100),
  image: z.enum(['coupling', 'guide', 'housing']), category: z.enum(['rotary', 'linear', 'machining']),
  summary: z.string().trim().min(1).max(600), detail: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
}).strict()

/** Public manufacturing inputs; product imagery remains explicitly illustrative. */
export const manufacturingParameters = z.object({
  brandName: z.string().trim().min(1).max(80).default('Northline'),
  tagline: z.string().trim().min(1).max(100).default('PRECISION COMPONENTS'),
  style: z.enum(['industrial', 'precision', 'international']).default('industrial'),
  products: z.array(productSchema).min(1).max(30).optional(),
}).strict().refine(value => !value.products || new Set(value.products.map(product => product.slug)).size === value.products.length, 'Product slugs must be unique')

/** Resolved manufacturing inputs accepted by the renderer. */
export type ManufacturingParameters = z.infer<typeof manufacturingParameters>

/** Bundled provider consumed through the shared Sites template service. */
export const manufacturingProvider: SiteTemplateProvider = {
  descriptor: {
    id: manufacturingTemplateId, version: manufacturingTemplateVersion, name: 'Manufacturing company',
    description: 'English manufacturing pages with industrial, precision and international layouts. Images are illustrative; inquiries remain unsent drafts.',
    parameters: z.toJSONSchema(manufacturingParameters),
  },
  resolve: input => {
    const { products, ...parameters } = manufacturingParameters.parse(input)
    return products ? { ...parameters, products } : parameters
  },
  // The provider's resolver establishes the concrete parameter type before render is called.
  render: parameters => manufacturingProject(parameters as ManufacturingParameters),
}
