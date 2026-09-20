/** Browser file transfer preserves source bytes; the Host validates paths before saving. */
import { zipSync } from 'fflate/browser'
import type { SiteProject } from '../../../packages/site/site/src/types.ts'

/** Compose the same revision request used for size checks and persistence.
 * @param project - Complete edited file tree.
 * @param baseRevisionId - Current revision observed when the editor loaded.
 * @returns The version-checked HTTP body.
 */
export function siteRevisionBody(project: SiteProject, baseRevisionId: string | undefined) {
  return { changeSet: { ...(baseRevisionId ? { baseRevisionId } : {}), project } }
}

/** Read selected local files into a draft without sending them or replacing files implicitly.
 * @param project - Current unsaved source tree.
 * @param files - Explicitly selected files; no directory traversal is performed.
 * @param options - Destination, replacement choice, observed base and Host request limit.
 * @param signal - Editor lifetime cancellation.
 * @returns A complete draft preserving unrelated source and exact binary bytes.
 * @throws For duplicates, refused replacements, cancellation or an oversized revision request.
 */
export async function importSiteFiles(project: SiteProject, files: readonly File[], options: { directory: string; replace: boolean; baseRevisionId: string | undefined; maxBodyBytes: number }, signal: AbortSignal): Promise<SiteProject> {
  signal.throwIfAborted()
  if (files.reduce((sum, file) => sum + file.size, 0) > options.maxBodyBytes) throw new Error('tooLarge')
  const key = (path: string) => path.normalize('NFC').toLowerCase()
  const existing = new Map(project.files.map(file => [key(file.path), file]))
  const imported = new Set<string>()
  const directory = options.directory.trim().replace(/\/+$/, '')
  for (const file of files) {
    const path = directory ? `${directory}/${file.name}` : file.name
    const identity = key(path)
    if (imported.has(identity) || (existing.has(identity) && !options.replace)) throw new Error('duplicateFile')
    imported.add(identity)
    const bytes = new Uint8Array(await file.arrayBuffer())
    signal.throwIfAborted()
    let content = ''
    // Base64 keeps arbitrary assets and non-UTF-8 source byte-for-byte intact.
    for (const byte of bytes) content += String.fromCharCode(byte)
    existing.set(identity, { path: existing.get(identity)?.path ?? path, encoding: 'base64', content: btoa(content) })
  }
  const result = { ...project, files: [...existing.values()] }
  if (new TextEncoder().encode(JSON.stringify(siteRevisionBody(result, options.baseRevisionId))).byteLength > options.maxBodyBytes) throw new Error('tooLarge')
  return result
}

/** Export an editable project as ordinary ZIP entries, without a platform-specific envelope.
 * @param project - Saved or unsaved file tree selected by the user.
 * @returns ZIP bytes preserving relative names, UTF-8 source and binary assets.
 */
export function siteSourceZip(project: SiteProject): Uint8Array<ArrayBuffer> {
  const entries: Record<string, Uint8Array> = Object.create(null)
  for (const file of project.files) {
    entries[file.path] = file.encoding === 'utf8' ? new TextEncoder().encode(file.content) : Uint8Array.from(atob(file.content), char => char.charCodeAt(0))
  }
  return zipSync(entries, { level: 0 })
}
