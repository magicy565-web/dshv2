/** Wire parsing for template selection is shared by editor and model consumers. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SiteTemplateId } from '../../../packages/site/site/src/template-types.ts'
import type { SiteTemplateRequest } from '../../../packages/site/site/src/template-types.ts'

/** Explicit installed template identity, exact version and provider-owned JSON parameters. */
export const siteTemplateInput = z.object({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  parameters: z.record(z.string(), z.unknown()),
}).strict()

/** Assign template identity after shared wire validation.
 * @param input - Validated transport fields.
 * @returns Typed request for the provider registry.
 */
export function siteTemplateSelection(input: z.infer<typeof siteTemplateInput>): SiteTemplateRequest {
  return { ...input, id: brandString<SiteTemplateId>(input.id) }
}
