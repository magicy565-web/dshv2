/** Replaceable source compilation and sandboxed browser preview operations. */
import { buildStaticSite } from './project.ts'
import { renderStaticPreview } from './preview.ts'

/** Trusted rendering providers never execute generated application code in the Host. */
export interface SiteRendering {
  /** Compile the exact revision into immutable file bytes. */
  readonly build: typeof buildStaticSite
  /** Render a private browser response with bounded output and rewritten local references. */
  readonly preview: typeof renderStaticPreview
}

/** Default static source compiler and isolated browser renderer. */
export const staticSiteRendering: SiteRendering = { build: buildStaticSite, preview: renderStaticPreview }
