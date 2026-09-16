import type { Branded } from '@deepseek-ai/dsh-brand'
import type { PublishJobId, SiteId, SiteRevisionId } from '@deepseek-ai/dsh-site'
import type { StoreConnectionId } from '@deepseek-ai/dsh-shopify'

export type PublishAttemptId = Branded<'PublishAttemptId'>
export function PublishAttemptId(value: string): PublishAttemptId { return value as PublishAttemptId }

export interface PublishAttempt {
  readonly id: PublishAttemptId
  readonly jobId: PublishJobId
  readonly siteId: SiteId
  readonly revisionId: SiteRevisionId
  readonly connectionId: StoreConnectionId
  readonly number: number
  readonly status: 'running' | 'succeeded' | 'failed'
  readonly startedAt: string
  readonly finishedAt?: string
  readonly error?: string
}

export interface PublishAuditEvent {
  readonly jobId: PublishJobId
  readonly attemptId: PublishAttemptId
  readonly siteId: SiteId
  readonly connectionId: StoreConnectionId
  readonly status: PublishAttempt['status']
  readonly at: string
}
