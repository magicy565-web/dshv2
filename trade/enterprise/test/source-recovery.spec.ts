// @vitest-environment jsdom
/** Browser retries retain selection and reconcile ambiguous transport results with saved receipts. */
import { createElement } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '../../../packages/test-support/client-runtime/src/translate.ts'
import { createModel } from '../src/model.ts'
import { SourcePanel } from '../src/client-sources.tsx'
import { en, zh } from '../src/locales.ts'
import { snapshotSchema } from '../src/schema.ts'
import { sourceImport } from '../src/source-schema.ts'

const recordedAt = '2026-09-21T00:00:00.000Z'
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const empty = () => snapshotSchema.parse({ profile: null, submittedAt: null, files: [], tasks: [], goals: [], approvals: [], geo: [], maxFileBytes: 1024, onboarding: { sessionId: null, revision: 0, scopeIds: [], completedAt: null }, imports: [] })
const selected = () => ['company.txt', 'product.txt'].map(name => new File(['facts'], name))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function transport(files: File[]) {
  const data = empty()
  const uploads: string[] = []
  const manifests: string[] = []
  let loseManifest = false
  let loseUpload = false
  let failProduct = false
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, options) => {
    if (url === '/api/enterprise/sources/import') {
      const input = JSON.parse(String(options?.body)) as { id: string }
      manifests.push(input.id)
      if (!data.imports!.some(batch => batch.id === input.id)) data.imports!.push(sourceImport.parse({
        id: input.id, createdAt: recordedAt,
        files: files.map(file => ({ path: file.name, size: file.size, status: 'pending', fileId: null, error: null, readChunks: [], assessment: null, chunkCount: 0 })),
      }))
      if (loseManifest) { loseManifest = false; throw new TypeError('Network response lost') }
    }
    return Response.json(data)
  })
  vi.stubGlobal('fetch', fetch)
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {})
  vi.spyOn(XMLHttpRequest.prototype, 'setRequestHeader').mockImplementation(() => {})
  vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (this: XMLHttpRequest, body) {
    const file = body as File
    uploads.push(file.name)
    const entry = data.imports![0]!.files.find(entry => entry.path === file.name)!
    if (failProduct && file.name === 'product.txt') {
      failProduct = false
      entry.status = 'failed'; entry.error = 'uploadBusy'
      Object.defineProperties(this, { status: { value: 409 }, responseText: { value: JSON.stringify({ error: 'uploadBusy' }) } })
      this.dispatchEvent(new Event('load'))
      return
    }
    entry.status = 'imported'; entry.error = null
    entry.fileId = id(data.files.length + 1) as typeof entry.fileId
    data.files.push({ id: entry.fileId!, name: file.name, size: file.size, mime: 'text/plain', category: 'document', knowledgeStatus: 'ready', createdAt: recordedAt })
    if (loseUpload) { loseUpload = false; this.dispatchEvent(new Event('error')); return }
    Object.defineProperties(this, { status: { value: 201 }, responseText: { value: JSON.stringify(data) } })
    this.dispatchEvent(new Event('load'))
  })
  return { data, uploads, manifests, fetch, loseManifest: () => { loseManifest = true }, loseUpload: () => { loseUpload = true }, failProduct: () => { failProduct = true } }
}

it('reuses a committed import after its creation response is lost', async () => {
  const files = selected(), server = transport(files), model = createModel()
  try {
    await model.load()
    server.loseManifest()
    expect(await model.importSources(files)).toBe(false)
    expect(server.uploads).toEqual([])
    expect(await model.importSources(files)).toBe(true)
    expect(server.manifests).toEqual([server.manifests[0], server.manifests[0]])
    expect(server.data.imports).toHaveLength(1)
    expect(server.uploads).toEqual(['company.txt', 'product.txt'])
  } finally { model.dispose() }
})

it('retries only failed files and preserves the specific failure reason', async () => {
  const files = selected(), server = transport(files), model = createModel()
  try {
    await model.load()
    server.failProduct()
    expect(await model.importSources(files)).toBe(false)
    expect(model.source.getSnapshot().error).toBe('uploadBusy')
    expect(await model.importSources(files)).toBe(true)
    expect(server.data.imports).toHaveLength(1)
    expect(server.uploads).toEqual(['company.txt', 'product.txt', 'product.txt'])
    expect(model.source.getSnapshot()).toMatchObject({ error: null, busy: false, progress: null })
  } finally { model.dispose() }
})

it('accepts the saved receipt when the upload response is lost', async () => {
  const files = selected(), server = transport(files), model = createModel()
  try {
    await model.load()
    server.loseUpload()
    expect(await model.importSources(files)).toBe(true)
    expect(server.data.files).toHaveLength(2)
    expect(server.uploads).toEqual(['company.txt', 'product.txt'])
  } finally { model.dispose() }
})

it('retains selected files after failure and clears them only after successful retry', async () => {
  const files = selected(), importSources = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const view = render(createElement(SourcePanel, { state: { data: empty(), busy: false, error: null, progress: null }, t: makeTranslate(zh), importSources, recognize: vi.fn(), start: vi.fn() }))
  fireEvent.change(view.container.querySelector('input')!, { target: { files } })
  await act(async () => { fireEvent.click(view.getByRole('button', { name: zh.sourceImport })) })
  expect(view.getByText('company.txt')).toBeTruthy()
  await act(async () => { fireEvent.click(view.getByRole('button', { name: zh.sourceImport })) })
  expect(importSources.mock.calls[0]![0]).toBe(importSources.mock.calls[1]![0])
  expect(view.queryByText('company.txt')).toBeNull()
})

it.each([['zh', zh], ['en', en]] as const)('shows durable progress and specific skipped-file reasons in %s', async (locale, copy) => {
  const data = empty()
  data.files.push({ id: id(1) as typeof data.files[number]['id'], name: 'catalog.txt', size: 5, mime: 'text/plain', category: 'document', knowledgeStatus: 'ready', createdAt: recordedAt })
  data.imports = [sourceImport.parse({ id: id(2), createdAt: recordedAt, files: [
    { path: 'Company/catalog.txt', size: 5, status: 'imported', fileId: id(1), error: null, readChunks: [1], chunkCount: 3, assessment: { disposition: 'needs_input', reason: 'Confirm conflicting dimensions' } },
    { path: 'Company/empty.txt', size: 0, status: 'skipped', fileId: null, error: 'emptyFile', readChunks: [], assessment: null },
    { path: 'Company/missing.txt', size: 5, status: 'failed', fileId: id(3), error: 'missing', readChunks: [], assessment: null },
    { path: 'Company/waiting.txt', size: 5, status: 'pending', fileId: null, error: null, readChunks: [], assessment: null },
  ] })]
  const view = render(createElement(SourcePanel, { state: { data, busy: false, error: null, progress: null }, t: makeTranslate(copy), importSources: vi.fn(), recognize: vi.fn(), start: vi.fn() }))
  expect(view.getByText(copy.emptyFile)).toBeTruthy()
  expect(view.getByText(copy.sourceMissing)).toBeTruthy()
  expect(view.getByText(copy.sourceRetryHint)).toBeTruthy()
  expect((view.getByRole('button', { name: copy.sourceStart }) as HTMLButtonElement).disabled).toBe(true)
  const summary = Array.from(view.getByRole('status').querySelectorAll('p'), paragraph => paragraph.textContent).join('\n') + '\n'
  await expect(summary).toMatchFileSnapshot(`./expected/source-progress.${locale}.txt`)
})
