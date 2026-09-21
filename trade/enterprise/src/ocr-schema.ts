/** OCR limits and persisted page provenance shared by Host and browser. */
import { z } from 'zod'

/** Local recognition is opt-in; language data can come from a deployment-owned location. */
export const ocrConfig = z.object({
  language: z.string().regex(/^[a-z_]+(?:\+[a-z_]+)*$/).default('eng+chi_sim'),
  langPath: z.string().min(1).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).default(120000),
  maxPages: z.number().int().positive().default(30),
  maxPixels: z.number().int().positive().default(16000000),
  renderScale: z.number().positive().max(4).default(2),
}).strict()

/** Errors retain the original asset and permit explicit retry. */
export const ocrError = z.enum(['ocrFailed', 'ocrTimeout', 'ocrLimit', 'ocrEmpty'])
/** Successful recognition is immutable; native passages keep their original ordinals. */
export const ocrReceipt = z.object({
  id: z.string().uuid().brand<'OcrRecognitionId'>(), language: z.string(),
  createdAt: z.iso.datetime(), reviewedAt: z.iso.datetime().nullable(),
  chunkOffset: z.number().int().nonnegative(), chunkPages: z.array(z.number().int().positive()).min(1),
  pages: z.number().int().positive(),
}).strict()
/** Worker output is validated before committing text and provenance. */
export const ocrResult = z.object({ pages: z.number().int().positive(), chunks: z.array(z.object({ page: z.number().int().positive(), text: z.string().min(1) }).strict()).min(1) }).strict()
/** Browser review contains the immutable recognition and its full extracted text. */
export const ocrReview = z.object({ receipt: ocrReceipt, chunks: ocrResult.shape.chunks }).strict()
