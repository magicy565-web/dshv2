# Agent Note: Enterprise computer disclosure and acceptance

Status: implemented

English | [中文](2026-09-20-enterprise-computer-acceptance.zh.md)

## Problem

Externally autonomous computers can continue after the local connection stops. Lease retry, a worker's completion message, and a local cancellation cannot establish whether external actions stopped or a usable result exists.

## Decision

The [enterprise computer module](../../../../trade/enterprise/computers.md) owns durable assignments beside enterprise tasks. Each binding has a revocable hashed HTTP credential; the server derives the worker identity and enforces exact per-job file grants. Job inputs and worker instructions are captured at creation. The existing enterprise library owns uploaded bytes; task approvals and audit records retain their existing storage owners. Human acceptance is separate from worker submission.

Only one claimed nonterminal assignment exists per binding. Repeated claims return it without a new attempt; inactivity never creates an automatic retry. Claimed cancellation records a request and needs an authenticated worker stop acknowledgement. Disconnect records uncertainty and revokes access without asserting remote termination. The local interface advertises no verified provider push, machine-health, remote-stop or desktop-streaming capability.

The [local enterprise ownership decision](2026-09-14-local-enterprise-workspace.md) remains active for persistence and shared-login scope. The [Grokbot task bridge](../feature/2026-09-15-grokbot-task-bridge.md) remains active for its independent leased queue; this module neither mounts nor changes that service because its retry and cancellation semantics do not authorize autonomous enterprise side effects.

## Alternatives considered

**Reuse expired task leases.** A missing heartbeat cannot distinguish a stopped worker from an executed action whose receipt was lost. Automatic re-execution would risk repeating external writes.

**Trust worker success or arbitrary artifact URLs.** The worker cannot grant success. Required outputs must be uploaded through the existing content-validated asset path, and a human checks the actual result. Arbitrary Host paths and remote URL fetching would add unrelated access authority.

**Treat provider Bot names as tenant isolation.** Roles cannot isolate an account's shared files and sign-ins. This deployment explicitly serves one enterprise and requires dedicated provider accounts for separate trust groups. Binding identifiers are operator assertions, not provider verification.

## Consequences

SQLite schema version 13 retains assignments and hashed credentials. Transactions and observed revisions reject stale state changes. Approval continuation requires an approved unchanged enterprise task. Queued jobs can be cancelled locally; claimed jobs retain uncertainty until the worker confirms stopping. Revoked in-flight uploads can remain as inspectable enterprise assets without being accepted as task results.

Focused source tests cover identity, duplicate creation, approval revision checks, required files and cancellation. The built `dsh` Web profile test exercises the browser, authenticated HTTP worker, real file bytes and human acceptance on desktop and mobile. Real Grokbot account connectivity, automatic scheduling, MCP transport, model-driven delegation and recorded model Session replay remain outside this module's verified behavior.
