// @vitest-environment jsdom
/** Connection menus keep user actions available across the background polling interval. */
import { createElement } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '../../../packages/test-support/client-runtime/src/translate.ts'
import { ComputersPanel } from '../src/client-computers.tsx'
import { computerZh } from '../src/computer-locales.ts'

const computerId = '00000000-0000-4000-8000-000000000001'
const snapshot = {
  bindings: [{ id: computerId, name: 'Research workstation', provider: 'grokbot', enabled: true, account: 'research', worker: 'Buyer research', nativeUrl: 'https://example.test/workstation', instructions: 'Research public buyer information', createdAt: '2026-09-21T00:00:00.000Z' }],
  jobs: [], files: [], approvals: [], connections: [],
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps a menu usable while polling is due, sends its action once, then resumes polling', async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  let settleRead!: (response: Response) => void
  const nextRead = new Promise<Response>(resolve => { settleRead = resolve })
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockReturnValueOnce(nextRead)
  vi.stubGlobal('fetch', fetch)
  const view = render(createElement(ComputersPanel, { t: makeTranslate(computerZh) }))
  await act(async () => {})
  const trigger = view.getByRole('button', { name: computerZh.manageConnection })
  fireEvent.click(trigger)
  const rotate = view.getByRole('menuitem', { name: computerZh.rotate })
  expect(document.activeElement).toBe(rotate)

  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(view.getByRole('menu')).toBeTruthy()
  expect((rotate as HTMLButtonElement).disabled).toBe(false)
  expect(fetch).toHaveBeenCalledTimes(1)

  await act(async () => { fireEvent.click(rotate) })
  expect(view.queryByRole('menu')).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ action: 'rotate', id: computerId }) })

  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect((trigger as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(trigger)
  expect(view.queryByRole('menu')).toBeNull()
  await act(async () => { settleRead(Response.json(snapshot)) })
  expect((trigger as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(trigger)
  expect(view.getByRole('menuitem', { name: computerZh.rotate })).toBeTruthy()
})

it('keeps polling paused when switching menus and resumes after dismissing them', async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const twoComputers = { ...snapshot, bindings: [...snapshot.bindings, { ...snapshot.bindings[0], id: '00000000-0000-4000-8000-000000000002', name: 'Sales workstation' }] }
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json(twoComputers))
  vi.stubGlobal('fetch', fetch)
  const view = render(createElement(ComputersPanel, { t: makeTranslate(computerZh) }))
  await act(async () => {})
  const [first, second] = view.getAllByRole('button', { name: computerZh.manageConnection }) as HTMLButtonElement[]
  fireEvent.click(first!)
  fireEvent.pointerDown(second!)
  fireEvent.click(second!)
  expect(view.getAllByRole('menu')).toHaveLength(1)
  expect(second!.getAttribute('aria-expanded')).toBe('true')
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(fetch).toHaveBeenCalledTimes(1)

  fireEvent.keyDown(document, { key: 'Escape' })
  expect(view.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(second)
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(fetch).toHaveBeenCalledTimes(2)

  fireEvent.click(first!)
  act(() => { view.getByRole('searchbox', { name: computerZh.searchComputers }).focus() })
  expect(view.queryByRole('menu')).toBeNull()
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(fetch).toHaveBeenCalledTimes(3)

  fireEvent.click(second!)
  fireEvent.pointerDown(document.body)
  expect(view.queryByRole('menu')).toBeNull()
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(fetch).toHaveBeenCalledTimes(4)

  fireEvent.click(first!)
  view.unmount()
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(fetch).toHaveBeenCalledTimes(4)
})
