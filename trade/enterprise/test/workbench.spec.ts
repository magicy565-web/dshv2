// @vitest-environment jsdom
/** Home presents the active goal, work in motion, pending decisions and confirmed outcomes. */
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { makeTranslate } from '../../../packages/test-support/client-runtime/src/translate.ts'
import { EnterpriseOverview } from '../src/client-overview.tsx'
import { en, zh } from '../src/locales.ts'
import { snapshotSchema, type Snapshot } from '../src/schema.ts'
import { taskSchema } from '../src/tasks-schema.ts'
import { businessGoalSchema } from '../src/business-goals-schema.ts'
import { opportunitySchema } from '../src/opportunities-schema.ts'
import { geoRecord } from '../src/geo-schema.ts'

const recordedAt = '2026-09-21T00:00:00.000Z'
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

function emptySnapshot(): Snapshot {
  return snapshotSchema.parse({
    profile: null, submittedAt: null, files: [], tasks: [], goals: [], approvals: [], geo: [], opportunities: [], maxFileBytes: 1024,
    onboarding: { sessionId: null, revision: 0, scopeIds: [], completedAt: null },
  })
}

function goal(value: number, title: string, status: Snapshot['goals'][number]['status'], dueDate: string | null = '2099-12-31') {
  return businessGoalSchema.parse({
    id: id(value), title, successCriteria: 'Win 10 qualified buyers and 3 sample requests', owner: '', dueDate, status,
    outcome: status === 'achieved' ? 'Signed 3 buyers' : '', archived: false, revision: 1, createdAt: recordedAt, updatedAt: recordedAt,
  })
}

function task(value: number, title: string, status: Snapshot['tasks'][number]['status'], archived = false, goalId: string | null = null, outcome = '') {
  return taskSchema.parse({ id: id(value), title, status, archived, revision: 1, description: '', assignee: '', dueDate: null, goalId, outcome, createdAt: recordedAt, updatedAt: recordedAt })
}

function opportunity(value: number, status: Snapshot['opportunities'][number]['status'], archived = false) {
  return opportunitySchema.parse({
    id: id(value), buyerName: `Buyer ${value}`, buyerWebsite: '', country: 'Germany', targetProduct: 'Industrial components',
    contactName: '', contactRole: '', contactEmail: '', summary: 'Buyer requested a catalog.', matchScore: 80, matchRationale: 'Relevant product inquiry',
    procurementSignals: [], evidence: [{ label: 'Buyer inquiry', uri: 'https://example.test/inquiry', note: 'Requested industrial components', observedAt: recordedAt }],
    status, nextAction: 'Review requirements', lastContactAt: null, archived, revision: 1, createdAt: recordedAt, updatedAt: recordedAt,
  })
}

function recordsSnapshot(): Snapshot {
  return snapshotSchema.parse({
    ...emptySnapshot(),
    goals: [goal(1, 'Expand Printed Rayon into the US market', 'active')],
    geo: [
      { value: 1, status: 'confirmed', kind: 'company' },
      { value: 2, status: 'draft', kind: 'product' },
      { value: 3, status: 'confirmed', kind: 'product' },
    ].map(record => geoRecord.parse({
      id: id(record.value), kind: record.kind, name: `Record ${record.value}`, description: 'Industrial components for overseas buyers',
      sections: [{ label: 'Business', content: 'Manufactures industrial components', source: 'Submitted company catalog' }], questions: '',
      status: record.status, sessionId: 'workbench-fixture', revision: 1, createdBy: 'user', updatedAt: recordedAt,
      confirmedAt: record.status === 'confirmed' ? recordedAt : null,
    })),
    files: [
      { id: id(1), name: 'catalog.pdf', mime: 'application/pdf', size: 100, category: 'document', knowledgeStatus: 'ready', createdAt: recordedAt },
      { id: id(2), name: 'product.png', mime: 'image/png', size: 100, category: 'image', knowledgeStatus: 'unsupported', createdAt: recordedAt },
      { id: id(3), name: 'notes.txt', mime: 'text/plain', size: 100, category: 'document', knowledgeStatus: 'failed', createdAt: recordedAt },
    ],
    opportunities: [opportunity(1, 'lead'), opportunity(2, 'negotiating'), opportunity(3, 'qualified', true), opportunity(4, 'won'), opportunity(5, 'lost')],
    tasks: [
      task(1, 'Review buyer requirements', 'todo'),
      task(2, 'Prepare product samples', 'in_progress', false, id(1)),
      task(3, 'Resolve shipping details', 'blocked'),
      task(4, 'Completed introduction', 'done', false, id(1), 'Sent the company introduction to the buyer'),
      task(5, 'Archived follow-up', 'todo', true),
    ],
  })
}

afterEach(cleanup)

describe('enterprise workbench home', () => {
  it('presents the active goal as the page brief with factual task context', () => {
    const navigate = vi.fn()
    const view = render(createElement(EnterpriseOverview, { data: recordsSnapshot(), t: makeTranslate(zh), navigate }))
    const brief = view.getByRole('region', { name: '当前业务目标' })
    expect(within(brief).getByRole('heading', { name: 'Expand Printed Rayon into the US market' })).toBeTruthy()
    expect(within(brief).getByText('推进中')).toBeTruthy()
    expect(within(brief).getByText('1 / 2 个任务已完成 · 0 个受阻')).toBeTruthy()
    fireEvent.click(within(brief).getByRole('button', { name: /查看目标/ }))
    expect(navigate.mock.calls).toEqual([['goals']])
  })

  it('marks a paused goal without work emphasis', () => {
    const data = snapshotSchema.parse({ ...recordsSnapshot(), goals: [goal(1, 'Pause market entry', 'paused')] })
    const view = render(createElement(EnterpriseOverview, { data, t: makeTranslate(zh), navigate: vi.fn() }))
    const brief = view.getByRole('region', { name: '当前业务目标' })
    expect(within(brief).getByText('已暂停')).toBeTruthy()
  })

  it('lists only work in motion inside the workstream', () => {
    const view = render(createElement(EnterpriseOverview, { data: recordsSnapshot(), t: makeTranslate(zh), navigate: vi.fn() }))
    const stream = view.getByRole('region', { name: '正在推进' })
    expect(within(stream).getByText('Prepare product samples')).toBeTruthy()
    expect(within(stream).getByText('Buyer 2')).toBeTruthy()
    for (const absent of ['Review buyer requirements', 'Completed introduction', 'Archived follow-up', 'Buyer 1', 'Buyer 3', 'Buyer 4', 'Buyer 5']) {
      expect(within(stream).queryByText(absent)).toBeNull()
    }
  })

  it('collects blocked tasks, draft records, failed files and new leads in the attention queue', () => {
    const view = render(createElement(EnterpriseOverview, { data: recordsSnapshot(), t: makeTranslate(zh), navigate: vi.fn() }))
    const queue = view.getByRole('complementary', { name: '需要你的处理' })
    expect(within(queue).getByText('Resolve shipping details')).toBeTruthy()
    expect(within(queue).getByText('Record 2')).toBeTruthy()
    expect(within(queue).getByText('notes.txt')).toBeTruthy()
    expect(within(queue).getByText('Buyer 1')).toBeTruthy()
    expect(within(queue).queryByText('Record 1')).toBeNull()
    expect(within(queue).queryByText('catalog.pdf')).toBeNull()
  })

  it('records completed tasks, won opportunities and confirmed records on the outcome rail', () => {
    const view = render(createElement(EnterpriseOverview, { data: recordsSnapshot(), t: makeTranslate(zh), navigate: vi.fn() }))
    const rail = view.getByRole('region', { name: '最近成果' })
    expect(within(rail).getByText('Completed introduction')).toBeTruthy()
    expect(within(rail).getByText('Buyer 4')).toBeTruthy()
    expect(within(rail).getByText('Record 1')).toBeTruthy()
    expect(within(rail).getByText('Record 3')).toBeTruthy()
    expect(within(rail).queryByText('Prepare product samples')).toBeNull()
    expect(within(rail).queryByText('Record 2')).toBeNull()
  })

  it('opens the owning workspace view from every row', () => {
    const navigate = vi.fn()
    const view = render(createElement(EnterpriseOverview, { data: recordsSnapshot(), t: makeTranslate(zh), navigate }))
    const stream = view.getByRole('region', { name: '正在推进' })
    const queue = view.getByRole('complementary', { name: '需要你的处理' })
    const rail = view.getByRole('region', { name: '最近成果' })
    const destinations: Array<[HTMLElement, string]> = [
      [within(stream).getByText('Prepare product samples'), 'tasks'],
      [within(stream).getByText('Buyer 2'), 'opportunities'],
      [within(queue).getByText('Resolve shipping details'), 'tasks'],
      [within(queue).getByText('Record 2'), 'ai'],
      [within(queue).getByText('notes.txt'), 'assets'],
      [within(queue).getByText('Buyer 1'), 'opportunities'],
      [within(rail).getByText('Completed introduction'), 'tasks'],
      [within(rail).getByText('Buyer 4'), 'opportunities'],
      [within(rail).getByText('Record 1'), 'supplier'],
    ]
    for (const [title, destination] of destinations) {
      navigate.mockClear()
      fireEvent.click(title.closest('button')!)
      expect(navigate.mock.calls).toEqual([[destination]])
    }
  })

  it.each([{ locale: 'zh', dictionary: zh }, { locale: 'en', dictionary: en }])('shows a goal-first empty workspace in $locale', async ({ locale, dictionary }) => {
    const navigate = vi.fn()
    const view = render(createElement(EnterpriseOverview, { data: emptySnapshot(), t: makeTranslate(dictionary), navigate }))
    expect(view.getByRole('heading', { name: dictionary.workbenchGoalCreate })).toBeTruthy()
    expect(view.queryByRole('list')).toBeNull()
    const visibleText = [...view.container.querySelectorAll('h2,h3,p,button')].map(element => element.textContent).join('\n') + '\n'
    await expect(visibleText).toMatchFileSnapshot(`./expected/workbench-empty.${locale}.txt`)
    fireEvent.click(view.getByRole('button', { name: dictionary.workbenchGoalCreateAction }))
    expect(navigate.mock.calls).toEqual([['goals']])
    navigate.mockClear()
    fireEvent.click(view.getByRole('button', { name: dictionary.workbenchStartSources }))
    expect(navigate.mock.calls).toEqual([['assets']])
  })
})
