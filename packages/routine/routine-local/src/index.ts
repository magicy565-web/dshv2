import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JobHooks } from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RoutineId, RoutineRunId, RoutineService } from '@deepseek-ai/dsh-routine'
import type {
  RoutineCreateRequest, RoutineRecord, RoutineRunRecord, RoutineRunResult, RoutineSchedule, RoutineScheduleInterval,
} from '@deepseek-ai/dsh-routine'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import z from 'zod'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap { routine: 'routine' }
}

const optionsSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  reasoningEffort: z.string().optional(),
  maxTokens: z.number().optional(),
})
const scheduleSchema = z.union([
  z.object({ kind: z.literal('once'), scheduledAt: z.string() }),
  z.object({ kind: z.literal('interval'), everySeconds: z.number().int().positive(), anchorAt: z.string() }),
])
const routineSchema = z.object({
  id: z.string(), name: z.string(), prompt: z.string(), schedule: scheduleSchema, nextRunAt: z.string().optional(),
  ownerSessionId: z.string(), agent: z.object({ cwd: z.string().optional(), options: optionsSchema }),
  status: z.union([z.literal('active'), z.literal('deleted')]), createdAt: z.string(),
})
const runSchema = z.object({
  id: z.string(), routineId: z.string(), source: z.union([z.literal('scheduled'), z.literal('manual')]),
  scheduledAt: z.string(),
  status: z.union([
    z.literal('queued'), z.literal('running'), z.literal('succeeded'),
    z.literal('failed'), z.literal('interrupted'), z.literal('skipped'),
  ]),
  sessionId: z.string().optional(), jobId: z.string().optional(),
  startedAt: z.string().optional(), finishedAt: z.string().optional(),
  error: z.string().optional(), summary: z.string().optional(),
})
const stateSchema = z.object({
  routines: z.array(routineSchema),
  runs: z.array(runSchema),
})
type State = { readonly routines: RoutineRecord[]; readonly runs: RoutineRunRecord[] }

const routineDomain = defineDomain({
  name: 'routine', version: 1, global: { schema: stateSchema, initial: { routines: [], runs: [] } },
  tables: { marker: domainTable(z.string()) },
})

const MAX_TIMER_DELAY_MS = 2_147_483_647
export const MIN_INTERVAL_SECONDS = 300

function iso(ms: number): string { return new Date(ms).toISOString() }
export function resolveIntervalNext(schedule: RoutineScheduleInterval, now: number): string {
  const anchor = Date.parse(schedule.anchorAt)
  const step = schedule.everySeconds * 1000
  const count = Math.floor((now - anchor) / step) + 1
  return iso(anchor + Math.max(0, count) * step)
}
function summaryOf(agent: Agent): string {
  const last = agent.session.deriveMessages().at(-1)
  return last === undefined ? '' : JSON.stringify(last).slice(0, 4000)
}

/** Single-host durable Routine provider. */
export default class LocalRoutineService extends RoutineService {
  static inject = ['storageDomain', 'agents', 'jobs']
  private readonly context: Context
  private readonly domainPromise: Promise<{ global: { get(): State; set(value: State): Promise<void> } }>
  private readonly stop = Promise.withResolvers<void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private driving: Promise<void> | undefined
  private state: State = { routines: [], runs: [] }

  constructor(ctx: Context) {
    super(ctx)
    this.context = ctx
    this.domainPromise = ctx.storageDomain.open(routineDomain) as unknown as typeof this.domainPromise
    const detachJobs = ctx.jobs.attachController('routine')
    ctx.effect(() => {
      void this.domainPromise.then(async (domain) => {
        this.state = domain.global.get()
        for (const run of this.state.runs.filter(item => item.status === 'running')) await this.updateRun(run.id, { status: 'interrupted', finishedAt: iso(Date.now()) })
        for (const run of this.state.runs.filter(item => item.status === 'queued')) {
          const routine = this.state.routines.find(item => item.id === run.routineId && item.status === 'active')
          if (routine !== undefined) this.startRun(routine, run, this.context.agents.get(routine.ownerSessionId))
        }
        this.scheduleDrive()
      })
      return async () => { this.stop.resolve(); detachJobs(); if (this.timer !== undefined) clearTimeout(this.timer); await this.driving }
    }, 'routine.lifecycle')
  }

  async create(request: RoutineCreateRequest): Promise<{ routine: RoutineRecord }> {
    if (request.name.trim() === '' || request.prompt.trim() === '') throw new Error('routine name and prompt must be non-empty')
    validateSchedule(request.schedule)
    await this.ready()
    const now = Date.now()
    const schedule = request.schedule.kind === 'once'
      ? { kind: 'once' as const, scheduledAt: request.schedule.scheduledAt }
      : { ...request.schedule, anchorAt: request.schedule.anchorAt }
    const routine: RoutineRecord = {
      id: RoutineId(`routine-${randomUUID()}`), name: request.name.trim(), prompt: request.prompt.trim(), schedule,
      nextRunAt: schedule.scheduledAt ?? schedule.anchorAt, ownerSessionId: request.owner.id,
      agent: { ...(request.owner.session.header.cwd === undefined ? {} : { cwd: request.owner.session.header.cwd }), options: { ...request.owner.options } }, status: 'active', createdAt: iso(now),
    }
    await this.save({ routines: [...this.state.routines, routine], runs: this.state.runs })
    this.scheduleDrive()
    return { routine }
  }

  list(owner: Agent): RoutineRecord[] { return this.state.routines.filter(item => item.ownerSessionId === owner.id && item.status === 'active') }

  async delete(id: RoutineId, owner: Agent): Promise<boolean> {
    await this.ready(); const found = this.state.routines.find(item => item.id === id && item.ownerSessionId === owner.id && item.status === 'active')
    if (found === undefined) return false
    await this.save({ routines: this.state.routines.map((item) => {
      if (item.id !== id) return item
      const { nextRunAt: _nextRunAt, ...withoutNext } = item
      return { ...withoutNext, status: 'deleted' as const }
    }), runs: this.state.runs })
    this.scheduleDrive(); return true
  }

  async runNow(id: RoutineId, owner: Agent): Promise<RoutineRunResult> {
    await this.ready(); const routine = this.state.routines.find(item => item.id === id && item.ownerSessionId === owner.id && item.status === 'active')
    if (routine === undefined) throw new Error('routine not found')
    if (this.state.runs.some(run => run.routineId === routine.id && (run.status === 'queued' || run.status === 'running'))) throw new Error('routine is already running')
    const run = await this.enqueueRun(routine, 'manual', iso(Date.now()))
    this.startRun(routine, run, owner)
    return { run }
  }

  private async ready(): Promise<void> { await this.domainPromise }
  private async save(next: State): Promise<void> {
    const domain = await this.domainPromise
    await domain.global.set(next)
    this.state = next
  }
  private async updateRun(id: RoutineRunId, patch: Partial<RoutineRunRecord>): Promise<void> {
    const current = this.state.runs.find(run => run.id === id)
    if (current === undefined) return
    await this.save({
      routines: this.state.routines,
      runs: this.state.runs.map(run => run.id === id ? { ...run, ...patch } : run),
    })
  }
  private async enqueueRun(routine: RoutineRecord, source: 'scheduled' | 'manual', scheduledAt: string): Promise<RoutineRunRecord> {
    const existing = source === 'scheduled' ? this.state.runs.find(run => run.routineId === routine.id && run.scheduledAt === scheduledAt) : undefined
    if (existing !== undefined) return existing
    const run: RoutineRunRecord = { id: RoutineRunId(`routine-run-${randomUUID()}`), routineId: routine.id, source, scheduledAt, status: 'queued' }
    await this.save({ routines: this.state.routines, runs: [...this.state.runs, run] }); return run
  }
  private startRun(routine: RoutineRecord, run: RoutineRunRecord, owner: Agent | undefined): void {
    let handle: { agent: Agent; dispose(): Promise<void> } | undefined
    let cancelled = false
    const task = async (): Promise<{ status: 'completed' | 'killed' | 'failed'; detail?: string; output?: string }> => {
      await this.updateRun(run.id, { status: 'running', startedAt: iso(Date.now()) })
      try {
        const created = await this.context.agents.create({ sessionId: SessionId(`routine-session-${run.id}`), meta: { ...(routine.agent.cwd === undefined ? {} : { cwd: routine.agent.cwd }) }, agentOptions: routine.agent.options })
        handle = created
        await this.updateRun(run.id, { sessionId: created.agent.id })
        created.agent.followup(createUserMessage({ content: [{ type: 'text', text: routine.prompt }], source: { kind: 'plugin', plugin: 'routine' } }))
        await created.agent.whenIdle()
        if (cancelled) {
          await this.updateRun(run.id, { status: 'interrupted', finishedAt: iso(Date.now()) })
          return { status: 'killed', detail: 'routine run cancelled' }
        }
        const summary = summaryOf(created.agent)
        await this.updateRun(run.id, { status: 'succeeded', finishedAt: iso(Date.now()), summary })
        return { status: 'completed', output: summary }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        await this.updateRun(run.id, { status: cancelled ? 'interrupted' : 'failed', finishedAt: iso(Date.now()), error: detail })
        return { status: cancelled ? 'killed' : 'failed', detail, output: detail }
      } finally {
        await handle?.dispose()
        this.scheduleDrive()
      }
    }
    let jobId: string | undefined
    try {
      jobId = this.context.jobs.start({ kind: 'routine', label: routine.name, ...(owner === undefined ? {} : { owner }), run: (): JobHooks => ({ cancel: (reason?: string) => { cancelled = true; handle?.agent.cancel(reason as never) }, done: task() }) })
      void this.updateRun(run.id, { jobId })
    } catch (error) {
      void this.updateRun(run.id, { status: 'failed', finishedAt: iso(Date.now()), error: error instanceof Error ? error.message : String(error) })
    }
  }
  private scheduleDrive(): void {
    if (this.driving !== undefined) return
    this.driving = this.drive().finally(() => { this.driving = undefined })
  }
  private async drive(): Promise<void> {
    await this.ready()
    const now = Date.now(); let next: number | undefined
    for (const routine of this.state.routines.filter(item => item.status === 'active' && item.nextRunAt !== undefined)) {
      const target = Date.parse(routine.nextRunAt as string)
      if (target <= now) {
        const busy = this.state.runs.some(run => run.routineId === routine.id && (run.status === 'queued' || run.status === 'running'))
        if (!busy) {
          const run = await this.enqueueRun(routine, 'scheduled', routine.nextRunAt as string)
          const nextRunAt = routine.schedule.kind === 'once' ? undefined : resolveIntervalNext(routine.schedule, now)
          await this.save({ routines: this.state.routines.map((item) => {
            if (item.id !== routine.id) return item
            return nextRunAt === undefined
              ? (() => { const { nextRunAt: _nextRunAt, ...withoutNext } = item; return withoutNext })()
              : { ...item, nextRunAt }
          }), runs: this.state.runs })
          const owner = this.context.agents.get(routine.ownerSessionId)
          this.startRun(routine, run, owner)
        }
      } else if (next === undefined || target < next) next = target
    }
    if (next !== undefined) {
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.scheduleDrive()
      }, Math.min(MAX_TIMER_DELAY_MS, Math.max(1, next - Date.now())))
    }
  }
}

function validateSchedule(schedule: RoutineSchedule): void {
  const target = Date.parse(schedule.kind === 'once' ? schedule.scheduledAt : schedule.anchorAt)
  if (!Number.isFinite(target) || target <= Date.now()) throw new Error('routine schedule must be in the future')
  if (schedule.kind === 'interval' && (!Number.isSafeInteger(schedule.everySeconds) || schedule.everySeconds < MIN_INTERVAL_SECONDS)) throw new Error(`routine interval must be at least ${MIN_INTERVAL_SECONDS} seconds`)
}
