/** Folder imports retain relative labels and per-file outcomes, never local filesystem authority. */
import { z } from 'zod'

/** Portable relative label; storage continues to use private UUID filenames. */
export const sourcePath = z.string().min(1).max(1000).refine(path => !/[\x00-\x1f\x7f\\:]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..'))
/** A browser-selected file's expected bytes and folder-relative label. */
export const sourceFile = z.object({ path: sourcePath, size: z.number().int().nonnegative() }).strict()
/** Stable import identity makes a lost creation response safe to retry. */
export const sourceManifest = z.object({ id: z.string().uuid().brand<'SourceImportId'>(), files: z.array(sourceFile).min(1) }).strict().refine(value => new Set(value.files.map(file => file.path)).size === value.files.length)
/** Durable import results include errors and explicit exclusions. */
export const sourceImport = z.object({
  id: sourceManifest.shape.id, createdAt: z.iso.datetime(),
  files: z.array(sourceFile.extend({
    status: z.enum(['pending', 'imported', 'skipped', 'failed']),
    fileId: z.string().uuid().brand<'EnterpriseFileId'>().nullable(), error: z.string().nullable(),
    readChunks: z.array(z.number().int().positive()), assessment: z.object({ disposition: z.enum(['used', 'excluded', 'needs_input']), reason: z.string().trim().min(1).max(2000) }).nullable(),
    chunkCount: z.number().int().nonnegative().default(0),
  })),
})
/** Saved import inventory with agent reading and disposition receipts. */
export type SourceImport = z.infer<typeof sourceImport>
/** Source reads are paginated; assessment never grants confirmation or publication. */
export const sourceCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), importId: sourceManifest.shape.id.optional(), offset: z.number().int().nonnegative().default(0) }).strict(),
  z.object({ action: z.literal('read'), fileId: z.string().uuid().brand<'EnterpriseFileId'>(), chunk: z.number().int().positive().default(1) }).strict(),
  z.object({ action: z.literal('assess'), importId: sourceManifest.shape.id, path: sourcePath, disposition: z.enum(['used', 'excluded', 'needs_input']), reason: z.string().trim().min(1).max(2000) }).strict(),
])

/**
 * Exclude hidden/configuration files and unsupported content before upload.
 * @param path - Validated relative label.
 * @returns A localized reason key, or null for a supported business asset.
 */
export function sourceExclusion(path: string): 'sourcePrivate' | 'unsupported' | null {
  const parts = path.toLowerCase().split('/')
  if (parts.some(part => part.startsWith('.') || ['node_modules', 'credentials', 'secrets'].includes(part)) || /(?:^|\/)(?:credentials|secrets)(?:\.|$)/i.test(path)) return 'sourcePrivate'
  return /\.(?:jpe?g|png|webp|gif|avif|mp4|webm|mov|pdf|docx|xlsx|pptx|txt|csv|md|zip)$/i.test(path) ? null : 'unsupported'
}
