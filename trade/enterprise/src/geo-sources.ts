/** Exact document citations retain file ownership when a draft omits explicit asset ids. */
import type { Asset } from './schema.ts'
import type { GeoFields } from './geo-schema.ts'

/**
 * Format the citation shared by document reads, search and draft associations.
 * @param asset - Persisted document label and optional folder path.
 * @param chunk - One-based indexed passage number.
 * @returns The exact source label returned to the Agent.
 */
export function documentCitation(asset: Pick<Asset, 'name' | 'source'>, chunk: number): string {
  return `[资料: ${asset.source?.path ?? asset.name}#片段${chunk}]`
}

/**
 * Add file associations from unambiguous indexed citations and typed supplier evidence.
 * @param fields - Parsed draft fields with any explicitly selected media.
 * @param documents - Existing indexed passage citations and their private file ids.
 * @returns Fields retaining explicit assets; ambiguous labels require explicit ids.
 */
export function linkGeoSources(fields: GeoFields, documents: Array<{ fileId: Asset['id']; citation: string }>): GeoFields {
  const cited = [...fields.sections.map(section => section.source), ...(fields.product?.evidence.map(evidence => evidence.citation) ?? [])].join('\n')
  const matches = new Map<string, Set<Asset['id']>>()
  for (const document of documents) if (cited.includes(document.citation)) {
    const ids = matches.get(document.citation) ?? new Set<Asset['id']>()
    ids.add(document.fileId)
    matches.set(document.citation, ids)
  }
  const ids = new Set(fields.assetIds ?? [])
  for (const match of matches.values()) if (match.size === 1) for (const id of match) ids.add(id)
  for (const evidence of fields.supplier?.evidence ?? []) if (evidence.source.type === 'document' || evidence.source.type === 'asset') ids.add(evidence.source.fileId)
  return ids.size ? { ...fields, assetIds: [...ids] } : fields
}
