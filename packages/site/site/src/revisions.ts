/** Revision content comparison for preview and human publication review. */
import { isDeepStrictEqual } from 'node:util'
import type { SiteContent, SiteRevisionDiff } from './types.ts'

/** Compare complete contents, including ordering and SEO changes.
 * @param before - Earlier content, or undefined for an initial revision.
 * @param after - Proposed content to review.
 * @returns Detached before/after records and field-level change indicators.
 */
export function compareSiteContent(before: SiteContent | undefined, after: SiteContent): SiteRevisionDiff {
  const previous = new Map((before?.pages ?? []).map(page => [page.id, page]))
  const next = new Map(after.pages.map(page => [page.id, page]))
  const previousFiles = new Map((before?.project?.files ?? []).map(file => [file.path, file]))
  const nextFiles = new Map((after.project?.files ?? []).map(file => [file.path, file]))
  return structuredClone({
    added: after.pages.filter(page => !previous.has(page.id)),
    removed: (before?.pages ?? []).filter(page => !next.has(page.id)),
    changed: after.pages.flatMap((page) => {
      const prior = previous.get(page.id)
      return prior && !isDeepStrictEqual(prior, page) ? [{ before: prior, after: page }] : []
    }),
    pageOrderChanged: !isDeepStrictEqual((before?.pages ?? []).map(page => page.id), after.pages.map(page => page.id)),
    themeChanged: !isDeepStrictEqual(before?.theme, after.theme),
    productOrderChanged: !isDeepStrictEqual(before?.productOrder ?? [], after.productOrder),
    files: {
      added: [...nextFiles.keys()].filter(path => !previousFiles.has(path)),
      removed: [...previousFiles.keys()].filter(path => !nextFiles.has(path)),
      changed: [...nextFiles.keys()].filter(path => previousFiles.has(path)
        && !isDeepStrictEqual(previousFiles.get(path), nextFiles.get(path))),
      frameworkChanged: before?.project?.framework !== after.project?.framework,
    },
  })
}
