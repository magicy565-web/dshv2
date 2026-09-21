/** A bounded worker owns PDF rasterization and the nested Tesseract workers. */
import { Worker } from 'node:worker_threads'
import { ocrError, ocrResult } from './ocr-schema.ts'
import type { ocrConfig } from './ocr-schema.ts'
import type { z } from 'zod'

/**
 * Recognize one private image or PDF without blocking the Host event loop.
 * @param path - Stored file, never a browser-provided filesystem path.
 * @param mime - Content-detected image or PDF type.
 * @param config - Deployment language, resource and timeout limits.
 * @param cachePath - Private directory for downloaded language data.
 * @param limits - Text and passage limits shared with document indexing.
 * @param signal - Request and Host cancellation.
 * @returns Complete page-labelled passages after the worker has exited; failures commit no partial text.
 */
export async function recognizeSource(path: string, mime: string, config: z.infer<typeof ocrConfig>, cachePath: string, limits: { maxExtractedCharacters: number; knowledgeChunkCharacters: number }, signal: AbortSignal): Promise<z.infer<typeof ocrResult>> {
  signal.throwIfAborted()
  const source = import.meta.url.endsWith('.ts')
  const worker = new Worker(new URL(source ? './ocr-worker.ts' : './ocr-worker.js', import.meta.url), { workerData: { path, mime, config, cachePath, limits }, execArgv: source ? ['--import', 'tsx/esm'] : [] })
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: () => void = () => {}
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { abort(); return }
      timer = setTimeout(() => reject(new Error('ocrTimeout')), config.timeoutMs)
      worker.once('error', () => reject(new Error('ocrFailed')))
      worker.once('exit', () => reject(new Error('ocrFailed')))
      worker.once('message', (message: unknown) => {
        const result = ocrResult.safeParse(message)
        if (result.success) resolve(result.data)
        else { const code = ocrError.safeParse(message); reject(new Error(code.success ? code.data : 'ocrFailed')) }
      })
    })
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    await worker.terminate()
  }
}
