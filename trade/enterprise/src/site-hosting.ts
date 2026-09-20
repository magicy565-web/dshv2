/** Version-bound staging and publication, with durable external-operation checkpoints. */
import { createHash, randomUUID } from 'node:crypto'
import type { SiteService, SiteSpec } from '../../../packages/site/site/src/index.ts'
import { SiteRevisionId } from '../../../packages/site/site/src/types.ts'
import type { SiteHostingStore } from './site-hosting-store.ts'
import type { HostingProjectId, SiteDeployment, SiteDeploymentId, SiteHostingState } from './site-hosting-schema.ts'
import { HostingRejected, type HostingBuild, type SiteHostingProvider } from './site-hosting-provider.ts'
import type { SiteDomain, SiteDomainName } from './site-domains-schema.ts'
import { assertNever } from '@deepseek-ai/dsh-util-values'

function observedDeployment(item: SiteDeployment, build: HostingBuild): SiteDeployment {
  const { error: _error, buildLog: _log, ...original } = item
  return { ...original, status: build.status, buildId: build.id, previewUrl: build.previewUrl,
    ...(build.error === undefined ? {} : { error: build.error }), ...(build.buildLog === undefined ? {} : { buildLog: build.buildLog }) }
}

/** Structured failures understood by the authenticated Sites HTTP adapter. */
export class SiteHostingError extends Error {
  /** Create a client-visible hosting failure.
   * @param status - HTTP status for the authorized operation.
   * @param message - Credential-free diagnostic.
   */
  constructor(readonly status: number, message: string) { super(message) }
}

/** Coordinates one hosting provider without tying site source storage to that provider. */
export class SiteHosting {
  private readonly active = new Set<string>()

  /** Bind the provider and its persistence to the workspace's source service.
   * @param sites - Source revisions and ownership authority.
   * @param store - Dedicated durable deployment records.
   * @param provider - Configured independent hosting provider; absent means unavailable.
   */
  constructor(private readonly sites: SiteService, private readonly store: SiteHostingStore, private readonly provider?: SiteHostingProvider) {}

  /** Read deployment history without a cloud request.
   * @param spec - Authenticated site identity.
   * @returns Provider availability and persisted deployment state.
   */
  get(spec: SiteSpec) {
    this.sites.resolve(spec)
    return { configured: Boolean(this.provider), ...this.store.get(spec.siteId) }
  }

  private async operation<T>(spec: SiteSpec, run: (provider: SiteHostingProvider) => Promise<T>): Promise<T> {
    this.sites.resolve(spec)
    if (!this.provider) throw new SiteHostingError(503, 'Independent hosting is not configured')
    if (this.active.has(spec.siteId)) throw new SiteHostingError(409, 'A hosting operation is already active')
    this.active.add(spec.siteId)
    try { return await run(this.provider) }
    finally { this.active.delete(spec.siteId) }
  }

  /** Submit the exact selected source once, retaining uncertain requests for manual reconciliation.
   * @param spec - Authenticated site identity.
   * @param revisionId - Saved revision selected for the cloud build.
   * @param signal - Caller/Host cancellation.
   * @returns Durable build record, including a failure if the provider submission is uncertain.
   */
  async stage(spec: SiteSpec, revisionId: SiteRevisionId, signal: AbortSignal): Promise<SiteHostingState> {
    return this.operation(spec, async provider => {
      signal.throwIfAborted()
      const project = this.sites.content(spec, SiteRevisionId(revisionId)).project
      if (!project) throw new SiteHostingError(422, 'The revision has no source project')
      let state = this.store.get(spec.siteId)
      if (state.pendingPromotionId || state.pendingAvailability || state.pendingDomain || state.deployments.some(item => item.status === 'submitting' || item.status === 'unknown')) throw new SiteHostingError(409, 'Reconcile the pending hosting operation before creating another build')
      const existing = state.deployments.find(item => item.revisionId === revisionId && item.status !== 'failed')
      if (existing) return state
      const digest = createHash('sha256').update(JSON.stringify({ framework: project.framework, files: [...project.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) })).digest('hex')
      const deployment = { id: randomUUID() as SiteDeploymentId, revisionId, digest, createdAt: new Date().toISOString(), status: 'submitting' as const, published: false }
      state = this.store.put({ ...state, deployments: [deployment, ...state.deployments] })
      try {
        const projectId = state.projectId ?? await provider.createProject(`dsh-${spec.siteId}`, signal)
        if (!state.projectId) state = this.store.put({ ...state, projectId })
        const build = await provider.stage(projectId, { id: deployment.id, revisionId, project, digest }, signal)
        return this.store.put({ ...state, deployments: state.deployments.map(item => item.id === deployment.id ? observedDeployment(item, build) : item) })
      } catch (error) {
        // A network failure can follow remote acceptance; automatic resubmission could create a second build.
        return this.store.put({ ...state, deployments: state.deployments.map(item => item.id === deployment.id ? { ...item, status: error instanceof HostingRejected ? 'failed' : 'unknown', error: error instanceof HostingRejected ? error.message : 'Cloud submission was not confirmed. Inspect the hosting provider before retrying.' } : item) })
      }
    })
  }

  /** Refresh remote builds and confirm actual production routing, including after a restart.
   * @param spec - Authenticated site identity.
   * @param signal - Caller/Host cancellation.
   * @returns Persisted observations; only confirmed production changes update the live record.
   */
  async refresh(spec: SiteSpec, signal: AbortSignal): Promise<SiteHostingState> {
    return this.operation(spec, async provider => {
      let state = this.store.get(spec.siteId)
      const projectId = state.projectId
      if (!projectId) return state
      const deployments = []
      for (const item of state.deployments) {
        deployments.push(await this.inspectDeployment(provider, projectId, item, signal))
      }
      state = { ...state, deployments }
      const production = await provider.production(projectId, signal)
      if (production) {
        const live = state.deployments.find(item => item.buildId === production.buildId)
        if (!live) throw new SiteHostingError(409, 'Production was changed outside this workspace')
        state = { ...state, liveDeploymentId: live.id, productionUrl: production.url, availability: production.paused ? 'offline' : 'online', deployments: state.deployments.map(item => item.id === live.id ? { ...item, published: true } : item) }
        if (state.pendingPromotionId === live.id) delete state.pendingPromotionId
        if (state.pendingAvailability?.deploymentId === live.id && state.pendingAvailability.paused === production.paused) delete state.pendingAvailability
      } else if (state.liveDeploymentId) state = { ...state, availability: 'unknown' }
      let domains: readonly SiteDomain[]
      try { domains = await provider.domains(projectId, signal) }
      catch (error) {
        this.store.put(state)
        throw error
      }
      state = { ...state, domains: [...domains] }
      if (state.pendingDomain) {
        const observed = domains.find(domain => domain.name === state.pendingDomain?.name)
        let completed: boolean
        switch (state.pendingDomain.operation) {
          case 'remove': completed = !observed; break
          case 'add': completed = Boolean(observed); break
          case 'verify': completed = observed?.verified === true; break
          default: return assertNever(state.pendingDomain.operation)
        }
        if (completed) delete state.pendingDomain
      }
      return this.store.put(state)
    })
  }

  private async inspectDeployment(provider: SiteHostingProvider, projectId: HostingProjectId, item: SiteDeployment, signal: AbortSignal): Promise<SiteDeployment> {
    if (!item.buildId && (item.status === 'unknown' || item.status === 'submitting')) {
      const recovered = await provider.recover(projectId, item, signal)
      if (!recovered) return item
      return observedDeployment(item, recovered)
    }
    if (!item.buildId || (item.status !== 'building' && !(item.status === 'failed' && item.buildLog === undefined))) return item
    const build = await provider.inspect(projectId, item.buildId, signal)
    return observedDeployment(item, build)
  }

  /** Inspect one preview build without requiring production routing or DNS access.
   * @param spec - Authenticated site identity.
   * @param deploymentId - Existing submission; this operation never creates a build.
   * @param signal - Caller/Host cancellation.
   * @returns Persisted build observations, retaining uncertain submissions for recovery.
   */
  async refreshDeployment(spec: SiteSpec, deploymentId: SiteDeploymentId, signal: AbortSignal): Promise<SiteHostingState> {
    return this.operation(spec, async provider => {
      signal.throwIfAborted()
      const state = this.store.get(spec.siteId)
      const item = state.deployments.find(deployment => deployment.id === deploymentId)
      if (!item) throw new SiteHostingError(404, 'Preview build not found')
      if (!state.projectId) return state
      const observed = await this.inspectDeployment(provider, state.projectId, item, signal)
      if (observed === item) return state
      return this.store.put({ ...state, deployments: state.deployments.map(deployment => deployment.id === deploymentId ? observed : deployment) })
    })
  }

  /** Route production to an already reviewed build; a later refresh confirms completion.
   * @param spec - Authenticated site identity.
   * @param input - Exact build and digest, plus the live deployment observed by the reviewer.
   * @param signal - Caller/Host cancellation.
   * @returns Pending promotion state, or an explicit provider rejection that permits a new review.
   */
  async publish(spec: SiteSpec, input: { deploymentId: string; digest: string; expectedLiveDeploymentId: string | null }, signal: AbortSignal): Promise<SiteHostingState> {
    return this.operation(spec, async provider => {
      let state = this.store.get(spec.siteId)
      if ((state.liveDeploymentId ?? null) !== input.expectedLiveDeploymentId || state.pendingPromotionId || state.pendingAvailability || state.pendingDomain) throw new SiteHostingError(409, 'Production changed or a promotion is pending; refresh before publishing')
      const deployment = state.deployments.find(item => item.id === input.deploymentId)
      if (!state.projectId || !deployment?.buildId || deployment.status !== 'ready' || deployment.digest !== input.digest) throw new SiteHostingError(409, 'The selected build is not ready or does not match the reviewed version')
      const actual = await provider.production(state.projectId, signal)
      if (actual?.paused) throw new SiteHostingError(409, 'Resume the website before publishing another build')
      const expected = state.deployments.find(item => item.id === state.liveDeploymentId)
      if (actual?.buildId !== expected?.buildId) throw new SiteHostingError(409, 'Production changed at the hosting provider; refresh before publishing')
      if (deployment.id === state.liveDeploymentId) return state
      const projectId = state.projectId
      delete state.operationError
      state = this.store.put({ ...state, pendingPromotionId: deployment.id })
      try { await provider.promote(projectId, deployment.buildId, deployment.published, signal) }
      catch (error) {
        if (error instanceof HostingRejected) {
          delete state.pendingPromotionId
          return this.store.put({ ...state, operationError: error.message })
        }
        throw error
      }
      return state
    })
  }

  /** Pause or restore access to the production version selected by the user.
   * @param spec - Authenticated site identity.
   * @param input - Desired availability and the production deployment observed during review.
   * @param signal - Caller/Host cancellation.
   * @returns Pending state until provider inspection confirms the requested availability.
   */
  async changeAvailability(spec: SiteSpec, input: { paused: boolean; expectedLiveDeploymentId: SiteDeploymentId }, signal: AbortSignal): Promise<SiteHostingState> {
    return this.operation(spec, async provider => {
      signal.throwIfAborted()
      let state = this.store.get(spec.siteId)
      const projectId = state.projectId
      if (!projectId || state.liveDeploymentId !== input.expectedLiveDeploymentId || state.pendingPromotionId || state.pendingAvailability || state.pendingDomain) throw new SiteHostingError(409, 'Refresh production status before changing availability')
      const deployment = state.deployments.find(item => item.id === state.liveDeploymentId)
      const actual = await provider.production(projectId, signal)
      if (!actual || actual.buildId !== deployment?.buildId) throw new SiteHostingError(409, 'Production changed at the hosting provider')
      if (actual.paused === input.paused) return this.store.put({ ...state, availability: actual.paused ? 'offline' : 'online' })
      delete state.operationError
      state = this.store.put({ ...state, pendingAvailability: { paused: input.paused, deploymentId: input.expectedLiveDeploymentId, requestedAt: new Date().toISOString() } })
      try { await provider.setPaused(projectId, input.paused, signal) }
      catch (error) {
        if (error instanceof HostingRejected) {
          delete state.pendingAvailability
          return this.store.put({ ...state, operationError: error.message })
        }
        throw error
      }
      return state
    })
  }

  /** Apply the reviewed domain change, recording uncertainty before the remote mutation.
   * @param spec - Authenticated site identity.
   * @param input - Canonical domain operation and the hosting generation displayed during review.
   * @param signal - Caller/Host cancellation.
   * @returns Durable pending state, or a recorded explicit provider rejection.
   */
  async changeDomain(spec: SiteSpec, input: { operation: 'add' | 'verify' | 'remove'; name: SiteDomainName; expectedGeneration: number }, signal: AbortSignal): Promise<SiteHostingState> {
    return this.operation(spec, async provider => {
      signal.throwIfAborted()
      let state = this.store.get(spec.siteId)
      const projectId = state.projectId
      if (!projectId || state.generation !== input.expectedGeneration || state.pendingDomain || state.pendingPromotionId || state.pendingAvailability) throw new SiteHostingError(409, 'Refresh hosting state before changing domains')
      if (input.name.endsWith('.vercel.app')) throw new SiteHostingError(400, 'Provider-managed domains cannot be changed here')
      const domains = await provider.domains(projectId, signal)
      const existing = domains.find(domain => domain.name === input.name)
      if (existing?.managed) throw new SiteHostingError(400, 'Provider-managed domains cannot be changed here')
      if (input.operation === 'verify' && !existing) throw new SiteHostingError(404, 'Domain is not attached to this site')
      if ((input.operation === 'add' && existing) || (input.operation === 'remove' && !existing)) return this.store.put({ ...state, domains: [...domains] })
      delete state.operationError
      state = this.store.put({ ...state, domains: [...domains], pendingDomain: { operation: input.operation, name: input.name, requestedAt: new Date().toISOString() } })
      try { await provider.changeDomain(projectId, input.operation, input.name, signal) }
      catch (error) {
        if (error instanceof HostingRejected) {
          delete state.pendingDomain
          return this.store.put({ ...state, operationError: error.message })
        }
        throw error
      }
      return state
    })
  }
}
