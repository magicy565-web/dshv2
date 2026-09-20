---
description: "Bind Grokbot computers to local enterprise jobs, scoped files and human acceptance."
kind: "package-reference"
---

# Enterprise computers

English | [中文](computers.zh.md)

## Summary

The **Enterprise computers** sidebar manages existing Grokbot accounts as external workers. The enterprise Host owns assignments, immutable context packages, file grants, approvals and acceptance. Grokbot owns execution in its native computer. Binding an account does not provision a computer or verify access to it. This is one enterprise per deployment, with the existing shared browser login; it is not a tenant-isolated hosted service.

## Table of Contents

- [Connect a workstation](#connect-a-workstation)
- [Worker HTTP connector](#worker-http-connector)
- [Acceptance and recovery](#acceptance-and-recovery)
- [Storage and verification](#storage-and-verification)

<a id="connect-a-workstation"></a>
## Connect a workstation

1. Start the [trade profile](../README.md#run-on-windows) and open **Enterprise computers**. Bind a name, dedicated provider account identifier, worker name, native HTTPS URL and responsibilities. The URL cannot contain credentials, query parameters or a fragment. The identifier is a user assertion, not provider account verification.
2. Save the once-shown connector credential into the authorized worker's secret storage. This credential belongs to your enterprise connector; it is not a Grokbot Gateway Token or Admin API key. The Host stores only its SHA-256 digest. **Rotate credential** invalidates the previous credential and can reconnect a disconnected binding. Never put the credential in task context, prompts, uploaded files or screenshots.
3. Select **Assign work**, enter the objective, versioned context and unknown facts, select necessary enterprise files, and list one required deliverable per line. Submission authorizes the worker to read the complete selected files. Every assignment creates a linked enterprise task. Files enter the external worker only through explicit grants; the full enterprise profile and knowledge library are not automatically shared.
4. Configure the worker to call the HTTP connector below, then start it in native Grokbot. Remote workers need an operator-managed HTTPS route to `/computer/v1/`; keep other local deployment routes private. The local loopback URL is not reachable from a hosted computer. Verify connectivity with `manifest` before claiming work.
5. Open uploaded deliverables and review the result in the workspace. Use the native computer for sign-in, CAPTCHA or other manual work.

All Bots on one provider account may share files and credentials. Independent security domains require independent provider accounts, even across deployments. The Host rejects duplicate account identifiers within this deployment, but cannot detect aliases or prove provider isolation. Instructions and connector approvals cannot restrict actions performed through websites already signed into the computer. Use provider and source-system permissions to enforce those restrictions.

<a id="worker-http-connector"></a>
## Worker HTTP connector

This is a deployment-owned HTTP API, not a Grokbot API or an MCP endpoint. Every request carries `Authorization: Bearer <connector credential>`. The server derives the binding from that credential; a worker cannot select another binding or workspace. Browser-origin requests are refused. Responses use `Cache-Control: no-store`; no provider credentials are returned. Configure `maxComputerBodyBytes` for JSON request limits; file uploads use the existing enterprise upload quotas and format validation.

| Method and path | Behavior |
|---|---|
| `GET /computer/v1/manifest` | Returns binding identity, operating instructions and explicitly unverified provider capabilities. |
| `POST /computer/v1/claim` | Returns `{job,resumed}`. Null means no work. Repeated claims return the same active assignment; they never authorize replaying actions. |
| `GET /computer/v1/job?id=<job-id>` | Returns the assigned job and its current approval, if any. |
| `GET /computer/v1/file?jobId=<job-id>&id=<file-id>` | Reads an explicitly granted input file while the job is running or waiting for a person/approval. |
| `POST /computer/v1/report` | Accepts the JSON report below with optimistic revision checking. |
| `POST /computer/v1/artifact?jobId=<job-id>&revision=<observed-revision>&output=0` | Uploads raw file bytes for the zero-based required output. Send `X-File-Name` with the percent-encoded display filename. Returns the job with the new file receipt and SHA-256. |

A report body contains `id`, `expectedRevision`, `action` and `message`. `action` is one of `progress`, `request_approval`, `submit_result`, `confirm_stop` or `fail`. `progress` can additionally set `waitingHuman: true`. Use the revision returned by each operation; after a conflict, read the job before deciding whether further work is allowed. Do not retry the whole task after an ambiguous external side effect.

```json
{"id":"<claimed-job-id>","expectedRevision":2,"action":"progress","message":"Public research is underway."}
```

The worker reads the claimed job's `instructions`, `context`, `contextVersion`, `inputFileIds` and `expectedOutputs`. It polls the job before external actions and at safe checkpoints. A `request_approval` message must identify the exact proposed action; it creates a normal enterprise task approval. The workspace can approve or reject it through the existing approval service. Continuation requires an approved, unchanged approval task. Rejection permits a failure report, not continued execution. Approval does not add file grants.

Upload each required deliverable using its index, then report `submit_result` with a summary and unresolved facts. An upload response lost in transit must be reconciled by reading `job.artifacts`; do not upload blindly. A concurrent cancellation or revocation can reject attachment after upload; the uploaded file remains in the enterprise library for inspection and removal. The connector never downloads worker-supplied URLs or opens worker-supplied Host paths.

<a id="acceptance-and-recovery"></a>
## Acceptance and recovery

Submission enters `VERIFYING`, never success. The platform requires an existing file for every required output before submission and again before successful acceptance. A human checks format, content and evidence and chooses success, partial completion or failure. Only successful acceptance marks the linked enterprise task done. A file hash establishes byte identity, not factual accuracy. Automatic content-specific verification is not implemented.

Only one nonterminal claimed assignment runs per binding. Claims have no expiring execution lease: silence does not requeue work. Repeated claims return `resumed: true`; the worker must reconcile its previous activity instead of restarting. **Mark uncertain** records `UNKNOWN` and blocks subsequent assignments pending investigation. Browser refresh and Host restart retain the persisted state without claiming the computer remains online.

An unclaimed queued job can be cancelled locally. For a claimed job, **Request stop** records `CANCEL_REQUESTED`; only an authenticated worker's `confirm_stop` after stopping records `CANCELLED`. This is worker attestation, not an independently verified provider stop. Late progress and completion cannot overwrite a pending stop. **Disconnect** revokes the credential, cancels unclaimed jobs and marks other nonterminal jobs `UNKNOWN`; it does not stop the remote computer. Inspect native Grokbot, reconnect with a rotated credential if necessary, request cancellation and obtain the worker's stop acknowledgement.

Automatic Grokbot wake-up, provider Admin API configuration, MCP installation, embedded desktop streaming, multiple worker roles per computer, and DSH model-driven delegation are not implemented by this module. `taskPush`, `remoteStop` and `embeddedDesktop` remain `UNVERIFIED`. The [older Grokbot queue](../../packages/webhook/webhook-grokbot/README.md) is separate and is not mounted by this module.

<a id="storage-and-verification"></a>
## Storage and verification

Enterprise SQLite schema version 13 adds computer records and hashed credentials. Linked tasks, approvals, file metadata and audit events use the existing owners. Job creation and state transitions are transactions; job UUIDs are idempotency keys and reject different payloads under the same key. No changes to the Harness loop or Session format are required. File grants reference immutable asset ids; deletion removes subsequent access. Back up the entire enterprise directory while the Host is stopped.

Build with `node trade/enterprise/build.mjs`. From the repository root, run `node node_modules/vitest/vitest.mjs run --config trade/enterprise/vitest.sites.config.ts trade/enterprise/test/computer-store.spec.ts` for state and authorization checks and `node --test trade/enterprise/test/computer-browser.test.mjs` for the built `dsh` profile, HTTP connector and desktop/mobile browser workflow. Browser evidence lives under `.trade-runtime/computer-evidence/`. Tests simulate the external worker; they do not establish real Grokbot connectivity or a recorded model Session.
