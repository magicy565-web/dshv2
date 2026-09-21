// @vitest-environment jsdom
/** Goal review and task outcomes share localized controls without automatic achievement. */
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { makeTranslate } from '../../../packages/test-support/client-runtime/src/translate.ts'
import { BusinessGoalPanel } from '../src/client-business-goals.tsx'
import { TaskPanel } from '../src/client-tasks.tsx'
import { businessGoalSchema } from '../src/business-goals-schema.ts'
import { taskSchema } from '../src/tasks-schema.ts'
import { en, zh } from '../src/locales.ts'

const time = '2026-09-21T00:00:00.000Z'
const goal = businessGoalSchema.parse({ id: '00000000-0000-4000-8000-000000000001', title: 'Confirm buyer fit', successCriteria: 'Two written confirmations', owner: 'Ada', dueDate: null, status: 'active', outcome: '', revision: 3, archived: false, createdAt: time, updatedAt: time })
const task = taskSchema.parse({ id: '00000000-0000-4000-8000-000000000002', title: 'Check inquiry', description: 'Read requirements', assignee: '', dueDate: null, status: 'todo', goalId: goal.id, outcome: '', revision: 2, archived: false, createdAt: time, updatedAt: time })

afterEach(cleanup)

it.each([{ locale: 'zh', copy: zh }, { locale: 'en', copy: en }])('requires a recorded outcome for human achievement in $locale', async ({ copy }) => {
  const command = vi.fn(async () => true)
  const generate = vi.fn(async () => true)
  const view = render(createElement(BusinessGoalPanel, { goals: [goal], tasks: [{ ...task, status: 'done', outcome: 'One buyer confirmed fit' }], busy: false, t: makeTranslate(copy), command, taskCommand: vi.fn(async () => true), generate }))
  expect(view.getByText(copy.businessGoalTaskCount.replace('{done}', '1').replace('{total}', '1').replace('{blocked}', '0'))).toBeTruthy()
  expect(command).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole('button', { name: copy.businessGoalPlan }))
  expect(generate).toHaveBeenCalledWith(copy.businessGoalPlanPrompt.replace('{id}', goal.id), true)
  fireEvent.click(view.getByRole('button', { name: copy.businessGoalEdit }))
  const dialog = within(view.getByRole('dialog'))
  fireEvent.change(dialog.getByLabelText(copy.businessGoalStatus), { target: { value: 'achieved' } })
  expect((dialog.getByRole('button', { name: copy.save }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(dialog.getByLabelText(new RegExp(copy.businessGoalOutcome)), { target: { value: 'Both buyers confirmed the product specification.' } })
  fireEvent.click(dialog.getByRole('button', { name: copy.save }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'update', id: goal.id, expectedRevision: 3, fields: { title: goal.title, successCriteria: goal.successCriteria, owner: 'Ada', dueDate: null, status: 'achieved', outcome: 'Both buyers confirmed the product specification.' } }))
})

it('opens the result editor before completing linked work and preserves attribution', async () => {
  const command = vi.fn(async () => true)
  const view = render(createElement(TaskPanel, { tasks: [task], goals: [goal], busy: false, t: makeTranslate(en), command }))
  fireEvent.change(view.getByLabelText(`${en.taskStatus} ${task.title}`), { target: { value: 'done' } })
  expect(command).not.toHaveBeenCalled()
  const dialog = within(view.getByRole('dialog'))
  expect((dialog.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(dialog.getByLabelText(new RegExp(en.taskOutcome)), { target: { value: 'Product requirements recorded in the inquiry.' } })
  fireEvent.click(dialog.getByRole('button', { name: en.save }))
  await waitFor(() => expect(command).toHaveBeenCalledWith(expect.objectContaining({ action: 'update', expectedRevision: 2, fields: expect.objectContaining({ goalId: goal.id, status: 'done', outcome: 'Product requirements recorded in the inquiry.' }) })))
})

it('keeps independent tasks available and excludes stopped goals from new assignments', () => {
  const view = render(createElement(TaskPanel, { tasks: [], goals: [{ ...goal, status: 'paused' }], busy: false, t: makeTranslate(en), command: vi.fn(async () => true) }))
  fireEvent.click(view.getByRole('button', { name: en.taskCreate }))
  const select = view.getByLabelText(en.taskGoal) as HTMLSelectElement
  expect(select.value).toBe('')
  expect([...select.options].map(option => option.textContent)).toEqual([en.taskNoGoal])
})
