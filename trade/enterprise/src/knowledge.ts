/** Bounded text extraction and deterministic chunking for enterprise documents. */
import { createReadStream } from 'node:fs'
import { OfficeParser } from 'officeparser'
import type { SupportedFileType } from 'officeparser'

/** Resource limits applied before extracted text enters SQLite. */
export interface KnowledgeLimits {
  maxExtractedCharacters: number
  knowledgeChunkCharacters: number
  maxDecompressedBytes: number
  maxArchiveEntries: number
  maxTableCells: number
}

/** Signals that a text-labelled upload is not valid UTF-8 text. */
export class InvalidTextFileError extends Error {
  constructor() {
    super('The uploaded text file is not valid UTF-8 text')
    this.name = 'InvalidTextFileError'
  }
}

/** Whether the stored MIME type has a text extractor. */
export function isIndexableMime(mime: string): boolean {
  return mime === 'text/plain'
    || mime === 'application/pdf'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

function officeFileType(mime: string): SupportedFileType {
  switch (mime) {
    case 'application/pdf': return 'pdf'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'pptx'
    default: throw new Error(`No Office parser is registered for ${mime}`)
  }
}

async function readUtf8(path: string, maxCharacters: number, signal: AbortSignal): Promise<{ text: string; truncated: boolean }> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let characters = 0
  try {
    for await (const value of createReadStream(path, { signal })) {
      const chunk = value as Buffer
      if (chunk.includes(0)) throw new InvalidTextFileError()
      const decoded = decoder.decode(chunk, { stream: true })
      characters += decoded.length
      if (text.length < maxCharacters) text += decoded.slice(0, maxCharacters - text.length)
    }
    const tail = decoder.decode()
    characters += tail.length
    if (text.length < maxCharacters) text += tail.slice(0, maxCharacters - text.length)
    return { text, truncated: characters > maxCharacters }
  } catch (error) {
    if (error instanceof InvalidTextFileError || signal.aborted) throw error
    if (error instanceof TypeError) throw new InvalidTextFileError()
    throw error
  }
}

function normalizeText(value: string, maxCharacters: number): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxCharacters)
}

function splitLong(value: string, maxCharacters: number): string[] {
  const chunks: string[] = []
  let remaining = value.trim()
  while (remaining.length > maxCharacters) {
    const window = remaining.slice(0, maxCharacters + 1)
    const candidates = [window.lastIndexOf('\n'), window.lastIndexOf('。'), window.lastIndexOf('. '), window.lastIndexOf(' ')]
    const splitAt = Math.max(...candidates.filter(index => index >= Math.floor(maxCharacters / 2)))
    const end = splitAt < 0 ? maxCharacters : splitAt + 1
    chunks.push(remaining.slice(0, end).trim())
    remaining = remaining.slice(end).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

function chunkText(value: string, maxCharacters: number): string[] {
  const chunks: string[] = []
  let current = ''
  const flush = (): void => {
    if (current) chunks.push(current)
    current = ''
  }
  for (const paragraph of value.split(/\n{2,}/)) {
    for (const part of splitLong(paragraph, maxCharacters)) {
      if (!current) current = part
      else if (current.length + part.length + 2 <= maxCharacters) current += `\n\n${part}`
      else { flush(); current = part }
    }
  }
  flush()
  return chunks
}

/**
 * Extract searchable text from one validated document.
 * @param path - Private UUID-addressed file path.
 * @param mime - Content-detected MIME type.
 * @param limits - Extraction, archive, table, and chunk bounds.
 * @param signal - Cancellation owned by the upload or plugin lifecycle.
 * @returns Searchable chunks; an empty array means the document contains no text.
 */
export async function extractKnowledge(
  path: string,
  mime: string,
  limits: KnowledgeLimits,
  signal: AbortSignal,
): Promise<string[]> {
  return (await extractDocument(path, mime, limits, signal)).chunks
}

/**
 * Extract bounded text while reporting whether source content was omitted by the character limit.
 * @param path - Private stored file.
 * @param mime - Detected document MIME type.
 * @param limits - Configured extraction limits.
 * @param signal - Upload or Host cancellation.
 * @returns Indexed chunks and a truncation flag; truncation cannot count as complete source coverage.
 */
export async function extractDocument(path: string, mime: string, limits: KnowledgeLimits, signal: AbortSignal): Promise<{ chunks: string[]; truncated: boolean }> {
  const raw = mime === 'text/plain'
    ? await readUtf8(path, limits.maxExtractedCharacters, signal)
    : String((await (await OfficeParser.parseOffice(path, {
      extractAttachments: false,
      ocr: false,
      includeRawContent: false,
      fileType: officeFileType(mime),
      decompressionLimits: {
        maxUncompressedBytes: limits.maxDecompressedBytes,
        maxZipEntries: limits.maxArchiveEntries,
        maxTableCells: limits.maxTableCells,
      },
      abortSignal: signal,
    })).to('text', {
      includeImages: false,
      includeCharts: false,
      abortSignal: signal,
    })).value)
  const content = typeof raw === 'string' ? raw : raw.text
  const truncated = typeof raw === 'string' ? raw.length > limits.maxExtractedCharacters : raw.truncated
  const normalized = normalizeText(content, limits.maxExtractedCharacters)
  return { chunks: normalized ? chunkText(normalized, limits.knowledgeChunkCharacters) : [], truncated }
}
