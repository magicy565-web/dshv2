import type { SiteChangeSet } from './types.ts'
import { validateSiteProject } from './project.ts'

/** Validate the model-produced change set before it reaches a provider. */
export function validateSiteChangeSet(changeSet: SiteChangeSet): readonly string[] {
  const errors: string[] = []
  if (changeSet.project !== undefined) errors.push(...validateSiteProject(changeSet.project))
  if (changeSet.pages !== undefined) {
    const ids = new Set<string>()
    const paths = new Set<string>()
    for (const page of changeSet.pages) {
      if (page.id.trim().length === 0) errors.push('page id must not be empty')
      if (page.title.trim().length === 0) errors.push(`page '${page.id}' title must not be empty`)
      if (ids.has(page.id)) errors.push(`pages contains duplicate id '${page.id}'`)
      ids.add(page.id)
      if (!page.path.startsWith('/')) errors.push(`page '${page.id}' path must start with '/'`)
      if (page.path.includes('..')) errors.push(`page '${page.id}' path cannot contain '..'`)
      if (page.path.includes('\\')) errors.push(`page '${page.id}' path cannot contain '\\'`)
      if (/[\u0000-\u001f\u007f]/.test(page.path)) errors.push(`page '${page.id}' path cannot contain control characters`)
      if (page.path.includes('?') || page.path.includes('#')) errors.push(`page '${page.id}' path cannot contain query or fragment delimiters`)
      if (paths.has(page.path)) errors.push(`pages contains duplicate path '${page.path}'`)
      paths.add(page.path)
    }
  }
  if (changeSet.theme !== undefined) {
    for (const [name, value] of Object.entries(changeSet.theme.colors)) {
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) errors.push(`theme color '${name}' must be a six-digit hex value`)
    }
  }
  if (changeSet.productOrder !== undefined) {
    const ids = new Set(changeSet.productOrder)
    if (ids.size !== changeSet.productOrder.length) errors.push('productOrder contains duplicate product ids')
  }
  return errors
}

/** Assert that a model-produced change set is publishable. */
export function assertValidSiteChangeSet(changeSet: SiteChangeSet): void {
  const errors = validateSiteChangeSet(changeSet)
  if (errors.length > 0) throw new Error(`invalid site change set: ${errors.join('; ')}`)
}
