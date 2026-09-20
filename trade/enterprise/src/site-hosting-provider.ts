/** Replaceable hosting provider operations executed by the Host. */
import type { SiteProject } from '../../../packages/site/site/src/types.ts'
import type { HostingBuildId, HostingProjectId, SiteDeploymentId } from './site-hosting-schema.ts'
import type { SiteDomain, SiteDomainName } from './site-domains-schema.ts'

/** A provider rejected an operation before accepting its external mutation. */
export class HostingRejected extends Error {}

/** Remote build observations; the provider owns build execution and access protection. */
export interface HostingBuild {
  readonly id: HostingBuildId
  readonly status: 'building' | 'ready' | 'failed'
  readonly previewUrl: string
  /** Credential-filtered failure summary, when the build failed. */
  readonly error?: string
  /** Bounded build-log tail; undefined means unavailable, an empty string means no log text. */
  readonly buildLog?: string
}

/** Independent hosting operations; publication never executes application code in the Host. */
export interface SiteHostingProvider {
  /** Create a new private project; fail if that name already belongs to a different project.
   * @param name - Workspace-generated stable project name.
   * @param signal - Operation cancellation including Host teardown.
   * @returns Provider-owned project identity, after preview protection is verified.
   */
  createProject(name: string, signal: AbortSignal): Promise<HostingProjectId>
  /** Stage a production build without assigning production domains.
   * @param projectId - Previously created project.
   * @param input - Exact saved source, stable request identity and digest.
   * @param signal - Operation cancellation including Host teardown.
   * @returns Remote build identity and protected URL; readiness requires inspection.
   */
  stage(projectId: HostingProjectId, input: { id: SiteDeploymentId; revisionId: string; project: SiteProject; digest: string }, signal: AbortSignal): Promise<HostingBuild>
  /** Read the selected build and reject a provider project mismatch.
   * @param projectId - Authorized provider project.
   * @param buildId - Saved build id.
   * @param signal - Operation cancellation.
   * @returns Current status and protected deployment URL.
   */
  inspect(projectId: HostingProjectId, buildId: HostingBuildId, signal: AbortSignal): Promise<HostingBuild>
  /** Find a submission after its response was lost; never resubmit it.
   * @param projectId - Authorized project saved before submission.
   * @param input - Stable workspace request identity and source digest.
   * @param signal - Operation cancellation.
   * @returns Matching build, or undefined when no matching build is observed.
   */
  recover(projectId: HostingProjectId, input: { id: SiteDeploymentId; digest: string }, signal: AbortSignal): Promise<HostingBuild | undefined>
  /** Request production routing to an existing ready build; acceptance is not completion.
   * @param projectId - Authorized provider project.
   * @param buildId - Exact build the user reviewed.
   * @param rollback - Whether this build previously served production traffic.
   * @param signal - Operation cancellation.
   */
  promote(projectId: HostingProjectId, buildId: HostingBuildId, rollback: boolean, signal: AbortSignal): Promise<void>
  /** Inspect actual production routing after a request or restart.
   * @param projectId - Authorized provider project.
   * @param signal - Operation cancellation.
   * @returns Current build and its production URL, or undefined before first publication.
   */
  production(projectId: HostingProjectId, signal: AbortSignal): Promise<{ buildId: HostingBuildId; url: string; paused: boolean } | undefined>
  /** Pause or resume the current production deployment without deleting source or rebuilding it.
   * @param projectId - Authorized provider project.
   * @param paused - Whether production requests should receive the provider's paused response.
   * @param signal - Operation cancellation.
   */
  setPaused(projectId: HostingProjectId, paused: boolean, signal: AbortSignal): Promise<void>
  /** Read bound domains and current DNS verification instructions.
   * @param projectId - Authorized provider project.
   * @param signal - Operation cancellation.
   * @returns Complete bounded domain observations; refuse truncated lists.
   */
  domains(projectId: HostingProjectId, signal: AbortSignal): Promise<readonly SiteDomain[]>
  /** Add, verify or remove one custom domain without moving it from another project.
   * @param projectId - Authorized provider project.
   * @param operation - Domain operation the user requested.
   * @param name - Canonical hostname, never a URL or provider project id.
   * @param signal - Operation cancellation.
   */
  changeDomain(projectId: HostingProjectId, operation: 'add' | 'verify' | 'remove', name: SiteDomainName, signal: AbortSignal): Promise<void>
}
