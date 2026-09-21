// @vitest-environment jsdom
/** Overview counts and navigation reflect saved business records. */
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { makeTranslate } from '../../../packages/test-support/client-runtime/src/translate.ts'
import { EnterpriseOverview } from '../src/client-overview.tsx'
import { en, zh } from '../src/locales.ts'
import { snapshotSchema, type Snapshot } from '../src/schema.ts'
import { taskSchema } from '../src/tasks-schema.ts'
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

function task(value: number, title: string, status: Snapshot['tasks'][number]['status'], archived = false) {
  return taskSchema.parse({ id: id(value), title, status, archived, revision: 1, description: '', assignee: '', dueDate: null, goalId: null, outcome: '', createdAt: recordedAt, updatedAt: recordedAt })
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
    tasks: [task(1, 'Review buyer requirements', 'todo'), task(2, 'Prepare product samples', 'in_progress'), task(3, 'Resolve shipping details', 'blocked'), task(4, 'Completed introduction', 'done'), task(5, 'Archived follow-up', 'todo', true)],
  })
}

afterEach(cleanup)

describe('enterprise workbench', () => {
  it('shows confirmed records, saved assets and only ongoing work', () => {
    const view = render(createElement(EnterpriseOverview, { data: recordsSnapshot(), t: makeTranslate(zh), navigate: vi.fn() }))
    expect(view.getByRole('button', { name: /^已确认档案/ }).textContent).toBe('已确认档案2已确认的企业与产品记录')
    expect(view.getByRole('button', { name: /^企业资料3/ }).textContent).toBe('企业资料3可重复使用的图片、视频和文档')
    expect(view.getByRole('button', { name: /^跟进中的机会/ }).textContent).toBe('跟进中的机会2未归档且尚未结束的买家机会')
    expect(view.getByRole('button', { name: /^待推进任务/ }).textContent).toBe('待推进任务3未归档且尚未完成的任务')
    expect(view.getByText('1 / 3 份资料可供 AI 检索')).toBeTruthy()
    expect(within(view.getByRole('list')).getAllByRole('listitem')).toHaveLength(3)
    expect(view.getByText('Review buyer requirements')).toBeTruthy()
    expect(view.getByText('Prepare product samples')).toBeTruthy()
    expect(view.getByText('Resolve shipping details')).toBeTruthy()
    expect(view.queryByText('Completed introduction')).toBeNull()
    expect(view.queryByText('Archived follow-up')).toBeNull()
  })

  it('opens the owning views from metrics, next actions and task rows', () => {
    const navigate = vi.fn()
    const view = render(createElement(EnterpriseOverview, { data: recordsSnapshot(), t: makeTranslate(zh), navigate }))
    const destinations = [
      [/^已确认档案/, 'supplier'], [/^企业资料3/, 'assets'], [/^跟进中的机会/, 'opportunities'], [/^待推进任务/, 'tasks'],
      [/^企业资料把产品介绍/, 'assets'], [/^机会看板查看买家线索/, 'opportunities'], [/^AI 创作使用已有资料/, 'ai'],
      ['查看全部任务', 'tasks'], [/^Review buyer requirements/, 'tasks'], ['查看企业展示', 'supplier'],
    ] as const
    for (const [name, destination] of destinations) {
      navigate.mockClear()
      fireEvent.click(view.getByRole('button', { name }))
      expect(navigate.mock.calls).toEqual([[destination]])
    }
  })

  it.each([{ locale: 'zh', dictionary: zh }, { locale: 'en', dictionary: en }])('shows an actionable empty workspace in $locale', async ({ locale, dictionary }) => {
    const navigate = vi.fn()
    const view = render(createElement(EnterpriseOverview, { data: emptySnapshot(), t: makeTranslate(dictionary), navigate }))
    expect(view.getByRole('heading', { name: dictionary.workbenchNoTasks })).toBeTruthy()
    expect(view.queryByRole('list')).toBeNull()
    const visibleText = [...view.container.querySelectorAll('h2,h3,p,button')].map(element => element.textContent).join('\n') + '\n'
    await expect(visibleText).toMatchFileSnapshot(`./expected/workbench-empty.${locale}.txt`)
    fireEvent.click(view.getByRole('button', { name: dictionary.taskCreate }))
    expect(navigate.mock.calls).toEqual([['tasks']])
  })
})
