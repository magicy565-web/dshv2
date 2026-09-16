import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'

export type RoutineId = Branded<'RoutineId'>
export type RoutineRunId = Branded<'RoutineRunId'>
export const RoutineId = (value: string): RoutineId => value as RoutineId
export const RoutineRunId = (value: string): RoutineRunId => value as RoutineRunId

export type RoutineStatus = 'active' | 'deleted'
export type RoutineRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'skipped'
export type RoutineRunSource = 'scheduled' | 'manual'

export interface RoutineScheduleOnce { readonly kind: 'once'; readonly scheduledAt: string }
export interface RoutineScheduleInterval { readonly kind: 'interval'; readonly everySeconds: number; readonly anchorAt: string }
export type RoutineSchedule = RoutineScheduleOnce | RoutineScheduleInterval

export interface RoutineAgentSnapshot {
  readonly cwd?: string
  readonly options: AgentOptions
}

export interface RoutineRecord {
  readonly id: RoutineId
  readonly name: string
  readonly prompt: string
  readonly schedule: RoutineSchedule
  readonly nextRunAt?: string
  readonly ownerSessionId: SessionId
  readonly agent: RoutineAgentSnapshot
  readonly status: RoutineStatus
  readonly createdAt: string
}

export interface RoutineRunRecord {
  readonly id: RoutineRunId
  readonly routineId: RoutineId
  readonly source: RoutineRunSource
  readonly scheduledAt: string
  readonly status: RoutineRunStatus
  readonly sessionId?: SessionId
  readonly jobId?: string
  readonly startedAt?: string
  readonly finishedAt?: string
  readonly error?: string
  readonly summary?: string
}

export interface RoutineCreateRequest {
  readonly name: string
  readonly prompt: string
  readonly schedule: RoutineSchedule
  readonly owner: Agent
}

export interface RoutineCreateResult { readonly routine: RoutineRecord }
export interface RoutineRunResult { readonly run: RoutineRunRecord }

declare module '@deepseek-ai/cordis' {
  interface Context { routine: RoutineService }
}

export abstract class RoutineService extends Service {
  constructor(ctx: Context) { super(ctx, 'routine') }
  abstract create(request: RoutineCreateRequest): Promise<RoutineCreateResult>
  abstract list(owner: Agent): RoutineRecord[]
  abstract delete(id: RoutineId, owner: Agent): Promise<boolean>
  abstract runNow(id: RoutineId, owner: Agent): Promise<RoutineRunResult>
}

export default RoutineService
