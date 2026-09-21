/** Private OCR worker: render complete pages, recognize locally, and reject incomplete results. */
import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createWorker } from 'tesseract.js'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { z } from 'zod'
import { ocrConfig, ocrError } from './ocr-schema.ts'

const input = z.object({ path: z.string(), mime: z.string(), config: ocrConfig, cachePath: z.string(), limits: z.object({ maxExtractedCharacters: z.number().int().positive(), knowledgeChunkCharacters: z.number().int().positive() }) }).parse(workerData)
const chunks: Array<{ page: number; text: string }> = []
let characters = 0

async function run() {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined
  try {
    const recognize = async (buffer: Buffer, page: number) => {
      worker ??= await createWorker(input.config.language, 1, { cachePath: input.cachePath, ...(input.config.langPath ? { langPath: input.config.langPath } : {}), errorHandler: () => {} })
      const { data } = await worker.recognize(buffer)
      const text = data.text.trim()
      characters += text.length
      if (characters > input.limits.maxExtractedCharacters) throw new Error('ocrLimit')
      for (let start = 0; start < text.length; start += input.limits.knowledgeChunkCharacters) {
        const part = text.slice(start, start + input.limits.knowledgeChunkCharacters).trim()
        if (part) chunks.push({ page, text: part })
      }
    }
    let pages = 1
    if (input.mime === 'application/pdf') {
      const task = getDocument({ data: new Uint8Array(await readFile(input.path)), stopAtErrors: true })
      try {
        const pdf = await task.promise
        pages = pdf.numPages
        if (pages > input.config.maxPages) throw new Error('ocrLimit')
        for (let number = 1; number <= pages; number++) {
          const page = await pdf.getPage(number)
          const viewport = page.getViewport({ scale: input.config.renderScale })
          const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height)
          if (width * height > input.config.maxPixels) throw new Error('ocrLimit')
          const canvas = createCanvas(width, height)
          // PDF.js accepts the Node canvas implementation but declares the browser canvas type.
          await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
          await recognize(canvas.toBuffer('image/png'), number)
          page.cleanup()
        }
      } finally { await task.destroy() }
    } else {
      const image = await loadImage(await readFile(input.path))
      if (image.width * image.height > input.config.maxPixels) throw new Error('ocrLimit')
      const canvas = createCanvas(image.width, image.height)
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'; context.fillRect(0, 0, image.width, image.height)
      context.drawImage(image, 0, 0)
      await recognize(canvas.toBuffer('image/png'), 1)
    }
    if (!chunks.length) throw new Error('ocrEmpty')
    return { pages, chunks }
  } finally { await worker?.terminate() }
}

try { parentPort!.postMessage(await run()) }
catch (error) { const code = ocrError.safeParse(error instanceof Error ? error.message : error); parentPort!.postMessage(code.success ? code.data : 'ocrFailed') }
