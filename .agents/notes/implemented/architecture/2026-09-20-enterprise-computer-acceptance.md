# Agent Note: Enterprise computer disclosure and acceptance

Status: implemented

English | [中文](2026-09-20-enterprise-computer-acceptance.zh.md)

## Problem

Externally autonomous computers can continue after the local connection stops. Lease retry, a worker's completion message, and a local cancellation cannot establish whether external actions stopped or a usable result exists.

## Decision

The [enterprise computer module](../../../../trade/enterprise/computers.md) owns durable assignments beside enterprise tasks. Each binding has a revocable hashed HTTP credential; the server derives the worker identity and enforces exact per-job file grants. Job inputs and worker instructions are captured at creation. The existing enterprise library owns uploaded bytes; task approvals and audit records retain their existing storage owners. Human acceptance is separate from worker submission.

Only one claimed nonterminal assignment exists per binding. Repeated claims return it without a new attempt; inactivity never creates an automatic retry. Claimed cancellation records a request and needs an authenticated worker stop acknowledgement. Disconnect records uncertainty and revokes access without asserting remote termination. Authenticated connector presence does not establish provider account ownership, machine health or provider push/stop support.

The [local enterprise ownership decision](2026-09-14-local-enterprise-workspace.md) remains active for persistence and shared-login scope. The [Grokbot task bridge](../feature/2026-09-15-grokbot-task-bridge.md) remains active for its independent leased queue; this module neither mounts nor changes that service because its retry and cancellation semantics do not authorize autonomous enterprise side effects.

The computer overview illustrates fetched job states rather than provider telemetry. A separately labeled motion preview changes only local presentation state and never writes assignments. Connecting animation denotes a local read or a demonstration, not an authenticated provider connection; completion requires accepted results. Explicit pause and system reduced-motion controls preserve access to every state without animation. This separation prevents visual activity from asserting unobserved execution or encouraging duplicate work.

The separately opened cloud computer console uses an outbound Python connector with optional MSS capture and xdotool input on an existing X11 desktop. Host-timed heartbeats establish connector liveness. Viewer demand limits frame retention; frames and commands remain transient rather than entering durable job or Session data. An input requires the current connector instance and a recent frame, dispatches once and blocks subsequent input until acknowledged. Lost receipts become uncertain instead of retryable. Restart, credential rotation and disconnect invalidate relay state. Provider provisioning and natural-language execution remain separate integrations; desktop input is explicit human control, not a model-visible tool.

Account-scoped Routine Webhooks notify Grok Bot to check its existing assignment. URL and sender-key references resolve from the Host environment; browser snapshots contain no provider secrets. A durable delivery record precedes the request. HTTP 200 acknowledges wakeup only; interrupted delivery remains unknown across restart and does not retry. The Python connector supplies revision-checked task commands and verifies upload hashes, while the external Bot owns natural-language execution. Routine instructions stay in owner-local expected output because they do not enter a Harness Session. Real-account execution still requires a provider-side Routine and an operator-verified artifact round trip.

## Alternatives considered

**Reuse expired task leases.** A missing heartbeat cannot distinguish a stopped worker from an executed action whose receipt was lost. Automatic re-execution would risk repeating external writes.

**Trust worker success or arbitrary artifact URLs.** The worker cannot grant success. Required outputs must be uploaded through the existing content-validated asset path, and a human checks the actual result. Arbitrary Host paths and remote URL fetching would add unrelated access authority.

**Treat provider Bot names as tenant isolation.** Roles cannot isolate an account's shared files and sign-ins. This deployment explicitly serves one enterprise and requires dedicated provider accounts for separate trust groups. Binding identifiers are operator assertions, not provider verification.

## Consequences

SQLite schema version 13 retains assignments and hashed credentials. Transactions and observed revisions reject stale state changes. Approval continuation requires an approved unchanged enterprise task. Queued jobs can be cancelled locally; claimed jobs retain uncertainty until the worker confirms stopping. Revoked in-flight uploads can remain as inspectable enterprise assets without being accepted as task results.

Focused source tests cover identity, duplicate creation, approval revision checks, required files and cancellation. The built `dsh` Web profile test exercises the browser, authenticated HTTP worker, real file bytes and human acceptance on desktop and mobile. Real Grokbot account connectivity, automatic scheduling, MCP transport, model-driven delegation and recorded model Session replay remain outside this module's verified behavior.
