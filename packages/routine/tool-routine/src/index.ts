import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { RoutineId } from '@deepseek-ai/dsh-routine'
import type { RoutineSchedule } from '@deepseek-ai/dsh-routine'
import type {} from '@deepseek-ai/dsh-routine'
import type {} from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export const name = 'tool-routine'
export const inject = ['routine', 'tools']

const routineSchema = { type: 'object', additionalProperties: true, properties: {} } as const
const runSchema = { type: 'object', additionalProperties: true, properties: {} } as const

function schedule(args: Record<string, unknown>): RoutineSchedule {
  const kind = args.kind
  if (kind === 'once') {
    if (typeof args.scheduled_at !== 'string') throw new Error('scheduled_at is required for a once Routine')
    return { kind: 'once', scheduledAt: args.scheduled_at }
  }
  if (kind === 'interval') {
    const anchorAt = args.anchor_at === undefined
      ? new Date(Date.now() + 1000).toISOString()
      : args.anchor_at
    if (typeof anchorAt !== 'string') throw new Error('anchor_at must be a string')
    return { kind: 'interval', everySeconds: Number(args.every_seconds), anchorAt }
  }
  throw new Error('routine kind must be once or interval')
}
function present(title: string, kind: 'read' | 'execute'): { card: 'generic'; title: string; kind: 'read' | 'execute' } { return { card: 'generic', title, kind } }
function owner(exec: ToolExecution) { if (exec.agent === undefined) throw new Error('routine tools require an agent owner'); return exec.agent }
function jsonObject(value: unknown): Record<string, JsonValue> { return value as Record<string, JsonValue> }

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'routine_create',
    description: 'Create a durable Routine that starts an independent Agent session at a future time. Use once for one execution or interval for fixed-rate repetition; this is not a same-session reminder.',
    parameters: {
      name: { type: 'string', required: true }, prompt: { type: 'string', required: true },
      kind: { type: 'string', required: true, enum: ['once', 'interval'] }, scheduled_at: { type: 'string' }, every_seconds: { type: 'integer' }, anchor_at: { type: 'string' },
    },
    output: { schema: routineSchema, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const result = await ctx.routine.create({
        name: args.name,
        prompt: args.prompt,
        schedule: schedule(args),
        owner: owner(exec),
      })
      return jsonObject(result.routine)
    },
    presentCall: () => present('Create Routine', 'execute'),
  }))
  ctx.tools.register(defineTool({
    name: 'routine_list', description: 'List active Routines owned by the current session.', parameters: {},
    output: { schema: { type: 'array', items: routineSchema }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (_args, exec) => Promise.resolve(ctx.routine.list(owner(exec)).map(jsonObject)), presentCall: () => present('List Routines', 'read'),
  }))
  ctx.tools.register(defineTool({
    name: 'routine_delete', description: 'Stop future executions of a Routine while retaining its run history.', parameters: { id: { type: 'string', required: true } },
    output: { schema: { type: 'object', additionalProperties: true, properties: {} }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      return { id: args.id, deleted: await ctx.routine.delete(RoutineId(args.id), owner(exec)) }
    }, presentCall: () => present('Delete Routine', 'execute'),
  }))
  ctx.tools.register(defineTool({
    name: 'routine_run_now', description: 'Start one immediate independent Agent run without changing the Routine schedule.', parameters: { id: { type: 'string', required: true } },
    output: { schema: runSchema, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const result = await ctx.routine.runNow(RoutineId(args.id), owner(exec))
      return jsonObject(result.run)
    }, presentCall: () => present('Run Routine Now', 'execute'),
  }))
}
