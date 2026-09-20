/** Portable project validation and deterministic static build artifacts. Generated code is never executed here. */
import { createHash } from 'node:crypto'
import type { SiteProject, SiteRevisionId } from './types.ts'

/** Immutable file bytes and MIME metadata produced by a static build. */
export interface SiteArtifactFile {
  readonly path: string
  readonly base64: string
  readonly contentType: string
  readonly sha256: string
}

/** Build output tied to the exact reviewed source revision. */
export interface SiteArtifact {
  readonly revisionId: SiteRevisionId
  readonly digest: string
  readonly files: readonly SiteArtifactFile[]
}

const contentTypes: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif',
  gif: 'image/gif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml', pdf: 'application/pdf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', wasm: 'application/wasm',
  webmanifest: 'application/manifest+json',
}

/** Check source paths and file encodings before storing or writing a project.
 * @param project - A project with structurally parsed fields.
 * @returns Errors for path traversal, ambiguous portable paths, credentials, or invalid file bytes.
 */
export function validateSiteProject(project: SiteProject): readonly string[] {
  const errors: string[] = []
  const paths = new Set<string>()
  for (const file of project.files) {
    const parts = file.path.split('/')
    if (!parts.every(part => /^[\p{L}\p{N}_@()[\]. -]+$/u.test(part) && !['.', '..'].includes(part) && !/[. ]$/.test(part)
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      errors.push(`project path '${file.path}' must be a portable relative file path`)
    }
    if (parts.some(part => /^(\.env(?:\..*)?|\.git|\.npmrc|\.ssh)$/i.test(part))) errors.push(`project path '${file.path}' cannot contain credentials or repository metadata`)
    const key = file.path.normalize('NFC').toLowerCase()
    if (paths.has(key)) errors.push(`project contains duplicate portable path '${file.path}'`)
    paths.add(key)
    if (file.encoding === 'base64' && Buffer.from(file.content, 'base64').toString('base64') !== file.content) errors.push(`project file '${file.path}' must contain canonical base64`)
    if (file.encoding === 'utf8' && Buffer.from(file.content, 'utf8').toString('utf8') !== file.content) errors.push(`project file '${file.path}' must contain valid Unicode`)
  }
  for (const path of paths) {
    const parts = path.split('/')
    parts.pop()
    while (parts.length) {
      if (paths.has(parts.join('/'))) errors.push(`project path '${path}' has a file as its parent`)
      parts.pop()
    }
  }
  return errors
}

/** Build static browser assets without running generated scripts on the host.
 * @param revisionId - Source revision being built; publication must retain this identity.
 * @param project - Complete source and asset tree.
 * @returns Detached files and a content digest independent of input file order.
 * @throws For invalid paths, missing index.html, or a framework requiring an isolated compiler.
 */
export function buildStaticSite(revisionId: SiteRevisionId, project: SiteProject): SiteArtifact {
  const errors = validateSiteProject(project)
  if (errors.length) throw new Error(errors.join('; '))
  if (project.framework !== 'static') throw new Error('Next.js projects require an isolated framework build provider')
  if (!project.files.some(file => file.path === 'index.html')) throw new Error('static site requires index.html')
  const files = project.files.map((file) => {
    const bytes = Buffer.from(file.content, file.encoding === 'utf8' ? 'utf8' : 'base64')
    return {
      path: file.path,
      base64: bytes.toString('base64'),
      contentType: contentTypes[posixExtension(file.path)] ?? 'application/octet-stream',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return { revisionId, digest: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files }
}

function posixExtension(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase()
}

/** Resolve exact assets before directory indexes and extensionless HTML pages.
 * @param artifact - Saved build output.
 * @param path - Decoded site-relative request path.
 * @returns The selected file, or undefined for a missing route.
 */
export function findSiteArtifactFile(artifact: SiteArtifact, path: string): SiteArtifactFile | undefined {
  const relative = path.replace(/^\//, '')
  for (const candidate of [relative, `${relative.replace(/\/$/, '')}/index.html`.replace(/^\//, ''), `${relative}.html`]) {
    const file = artifact.files.find(item => item.path === candidate)
    if (file) return file
  }
  return undefined
}

/** Return a private, script-capable preview isolated from the editor's cookies and DOM.
 * @param artifact - Build output for the requested authorized revision.
 * @param path - Decoded site-relative path, without a query or fragment.
 * @returns Asset response, or 404 without falling back to an unrelated page.
 */
export function sitePreviewResponse(artifact: SiteArtifact, path: string): Response {
  const file = findSiteArtifactFile(artifact, path)
  const headers = {
    'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline' blob: data:; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; media-src 'self' https: data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  }
  if (!file) return new Response('Not found', { status: 404, headers })
  return new Response(Buffer.from(file.base64, 'base64'), { headers: { ...headers, 'content-type': file.contentType } })
}
