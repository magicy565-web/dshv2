// @vitest-environment jsdom
/** A review action names the exact OCR receipt shown to the user. */
import { createElement } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '../../../packages/test-support/client-runtime/src/translate.ts'
import { SourceRecognition } from '../src/client-ocr.tsx'
import { en, zh } from '../src/locales.ts'
import { fileSchema } from '../src/schema.ts'
import { documentCitation } from '../src/geo-sources.ts'

const asset = fileSchema.parse({ id: '00000000-0000-4000-8000-000000000001', name: 'scan.pdf', size: 100, mime: 'application/pdf', category: 'document', knowledgeStatus: 'ready', createdAt: '2026-09-21T00:00:00.000Z', ocr: { id: '00000000-0000-4000-8000-000000000002', language: 'eng+chi_sim', createdAt: '2026-09-21T00:00:00.000Z', reviewedAt: null, pages: 2, chunkOffset: 1, chunkPages: [1, 2] } })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('retains native citations and identifies the original PDF page of OCR passages', () => {
  expect(documentCitation(asset, 1)).toBe('[资料: scan.pdf#片段1]')
  expect(documentCitation(asset, 2)).toBe('[资料: scan.pdf#OCR第1页#片段2]')
  expect(documentCitation(asset, 3)).toBe('[资料: scan.pdf#OCR第2页#片段3]')
})

it.each([['zh', zh], ['en', en]] as const)('shows page provenance and confirms only the displayed receipt in %s', async (locale, copy) => {
  const recognize = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ receipt: asset.ocr, chunks: [{ page: 1, text: 'AX-1 Steel' }, { page: 2, text: 'MOQ 100' }] })))
  const view = render(createElement(SourceRecognition, { asset, busy: false, t: makeTranslate(copy), recognize }))
  expect(view.getByText(copy.ocrPending)).toBeTruthy()
  await act(async () => { fireEvent.click(view.getByRole('button', { name: copy.ocrReview })) })
  expect(view.getByText('AX-1 Steel')).toBeTruthy()
  expect(view.getByText('MOQ 100')).toBeTruthy()
  const visible = Array.from(view.container.querySelectorAll('p, button, strong, pre'), node => node.textContent).join('\n') + '\n'
  await expect(visible).toMatchFileSnapshot(`./expected/ocr-review.${locale}.txt`)
  await act(async () => { fireEvent.click(view.getByRole('button', { name: copy.ocrConfirm })) })
  expect(recognize).toHaveBeenCalledExactlyOnceWith(asset.id, asset.ocr!.id)
})

it('keeps confirmation unavailable after a failed or stale review read', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: 'missing' }, { status: 404 })).mockResolvedValueOnce(Response.json({ receipt: { ...asset.ocr, id: '00000000-0000-4000-8000-000000000003' }, chunks: [{ page: 1, text: 'Stale receipt' }] }))
  vi.stubGlobal('fetch', fetch)
  const view = render(createElement(SourceRecognition, { asset, busy: false, t: makeTranslate(zh), recognize: vi.fn() }))
  await act(async () => { fireEvent.click(view.getByRole('button', { name: zh.ocrReview })) })
  expect(view.getByRole('alert').textContent).toBe(zh.serverError)
  expect((view.getByRole('button', { name: zh.ocrConfirm }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(view.getByRole('button', { name: zh.close }))
  await act(async () => { fireEvent.click(view.getByRole('button', { name: zh.ocrReview })) })
  expect((view.getByRole('button', { name: zh.ocrConfirm }) as HTMLButtonElement).disabled).toBe(true)
})
