/** Source-launched workers use the same OCR pipeline as the built Host. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { recognizeSource } from '../src/ocr.ts'
import { ocrConfig } from '../src/ocr-schema.ts'

it.skipIf(!process.env.DSH_ENTERPRISE_OCR_LANG_PATH)('recognizes from source and rejects text exceeding the configured limit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enterprise-ocr-source-'))
  try {
    const file = fileURLToPath(new URL('./fixtures/ocr-catalog.png', import.meta.url))
    const config = ocrConfig.parse({ langPath: process.env.DSH_ENTERPRISE_OCR_LANG_PATH })
    const recognize = (maxExtractedCharacters: number) => recognizeSource(file, 'image/png', config, directory, { maxExtractedCharacters, knowledgeChunkCharacters: 512 }, new AbortController().signal)
    const result = await recognize(10000)
    expect(result.chunks.map(chunk => chunk.text).join(' ')).toContain('AX-1')
    await expect(recognize(1)).rejects.toThrow('ocrLimit')
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
}, 30000)
