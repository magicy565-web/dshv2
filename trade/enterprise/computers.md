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
- [Connect one real Grok Bot account](#grokbot-routine)
- [Remote desktop connector](#remote-desktop-connector)
- [Motion preview](#motion-preview)
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

<a id="grokbot-routine"></a>
## Connect one real Grok Bot account

Start with one signed-in Grok Bot account and one working computer. [Provider isolation](https://docs.x.ai/grok-bot/computer-and-apps) is per user: Bots on the same account share files and logins. Bind that account once in DSH. Creating a DSH binding does not create a provider computer. Keep the DSH Host running and expose its worker routes through HTTPS reachable from the cloud computer.

1. Download the connector from **Cloud computer console → Connection setup and diagnostics** and place it in a persistent directory on the Grok Bot computer. First run `python3 computer_connector.py --help` and check that `claim`, `job`, `report`, `download`, `upload` and `routine` are listed; replace an older connector before configuring it. In that computer's terminal, run `python3 computer_connector.py configure`, entering the DSH HTTPS origin and the binding's credential in the hidden prompt. Run `python3 computer_connector.py check`. This checks the DSH connection, not Grok Bot execution.
2. Run `python3 computer_connector.py routine` to print the worker instruction. Ask your Bot to create a Routine using that instruction, with the actual absolute connector path substituted for `computer_connector.py`. No credentials belong in the Routine. The Bot uses the CLI to claim tasks, read granted inputs, report progress and upload actual files; the Bot itself performs the assignment in its apps.
3. In the saved Routine, configure a Webhook and copy its **POST to** URL and **key** into private environment variables on the DSH Host. The [official Routine guide](https://cursor.com/help/grok-bot/routines) describes these fields and Bearer authentication. If the account does not expose them, use an explicitly configured scheduled Routine or Test run in the provider app; DSH cannot manufacture the missing webhook credentials. Scheduled execution has a delay and consumes provider usage on each run.
4. Set `DSH_COMPUTER_ROUTINES` as below, using the exact DSH binding account identifier, then restart the trade profile. The referenced URL and key variables must exist. Configuration fails for missing values, duplicate accounts or invalid HTTPS URLs. URL and key values remain on the Host and are never returned in the fleet response.

```json
[{"account":"my-grok-account","urlEnv":"DSH_GROK_ONE_WEBHOOK_URL","keyEnv":"DSH_GROK_ONE_WEBHOOK_KEY"}]
```

5. Assign a read-only task: open a public page, capture its title and URL, and upload a Markdown report containing a unique phrase you supplied. Observe **accepted wakeup**, then a claimed task, then an uploaded file and **Awaiting review**. Open the file and compare it with the actual source before accepting it. A webhook acknowledgement, connector heartbeat or simulated screenshot alone does not pass this check.
6. Verify a stop request and an input-file grant with the same account. Add another account only after this round trip works. Each additional account needs its own computer, connector configuration, Routine and URL/key environment references. The Host routes by account; it never chooses another account automatically after a failure.

New job creation sends one wakeup for the oldest queued assignment when a matching Routine is configured and the account has no unresolved work. Only HTTP 200 records acceptance; no HTTP status marks the job complete. Delivery is recorded before sending and never retried automatically. Network failure or restart during delivery leaves an unknown result: reconcile in the native app and run the Routine there after inspecting prior work. A rejected delivery can be retried with **Notify Bot to check work** after correcting its configuration. The same control can wake a worker after human intervention or approval; it does not grant approval. After acceptance, failure or confirmed cancellation, the Host wakes the next queued assignment for that account. Outstanding work or uncertain execution blocks this handoff.

`computerWakeTimeoutMs` bounds the acknowledgement wait (default 15000, range 1000–60000). The CLI offers `claim`, `job`, `report`, `download` and `upload`; `--help` lists their arguments. Writes require an observed `--revision`; uploads require a zero-based `--output` and verify the returned SHA-256 against the local bytes. Downloads refuse to overwrite a file. `--max-file-bytes` bounds transfers (default 268435456); Host upload quotas still apply. The connector does not retry mutations or interpret natural language. Remote desktop heartbeats remain a separate optional `run --desktop` process.

On Windows, `trade/dev.ps1` also loads saved `*.clixml` webhook records from `%USERPROFILE%\.dsh-private\grokbot` when `DSH_COMPUTER_ROUTINES` is unset. Each record contains `account`, `webhookUrl` and a `senderKey` saved as a Windows-encrypted `SecureString`; only the same Windows user can decrypt it. The launcher passes these through process environment references and restores its previous environment on exit. Store connector credentials separately from these webhook records. An explicit `DSH_COMPUTER_ROUTINES` overrides this directory.

For a returning computer, keep its existing binding and private connector configuration, start the DSH Host and HTTPS tunnel, then run `check`. If the HTTPS origin changed, run `configure --url HTTPS_ORIGIN` with the existing connector credential; a changed tunnel address does not require a new binding or webhook key. Keep the Host and tunnel running during work. Before repeating a task, inspect its current state and uploaded artifacts. An automatic-start test requires a new assignment with a new challenge and no manual Routine run, `claim` command or Bot reminder; verify the returned file before accepting it.

| Observation | Next check |
|---|---|
| Webhook returned HTTP 200; task remains queued | Inspect the Routine run and its instruction to call `claim`. The webhook key authenticates DSH to the Routine; it does not configure the cloud connector. |
| `configure` fails after the hidden credential prompt | Use the DSH binding's connector credential, not the webhook key. Verify that the cloud terminal received the paste; a local clipboard is not proof of remote paste. Copying another command or URL replaces the clipboard. |
| `ValueError` without a detailed message | The connector deliberately suppresses error details. Check input format and credential length, then the response format; this message alone does not identify an invalid URL. |
| Homepage returns 401 | Check the authenticated `/computer/v1/manifest` route through `check`; the workspace homepage requires its own browser login. |
| `check` works but `claim` is not recognized | Replace the old connector and verify `--help`. Authentication alone does not establish task-command support. |

<a id="remote-desktop-connector"></a>
## Remote desktop connector

Open **Cloud computer console** from the page header to view screenshots supplied by the outbound [Python connector](connector/computer_connector.py). Download it under **Connection setup and diagnostics**, transfer it to the cloud computer, and run `python3 computer_connector.py configure`. Enter the externally reachable DSH HTTPS origin and paste the credential into the hidden terminal prompt. Configuration verifies authentication before writing a private `~/.config/dsh-computer/connection.json` file. HTTPS redirects are refused; plain HTTP is accepted only for loopback development. Publish only `/computer/v1/` through your reverse proxy and keep the workspace login private.

Run `python3 computer_connector.py run` for connection monitoring. For an existing Linux X11 desktop, install [MSS](https://python-mss.readthedocs.io/latest/installation.html) in your Python environment and [xdotool](https://github.com/jordansissel/xdotool), then run `python3 computer_connector.py run --desktop`. The connector must inherit the desktop user's `DISPLAY` and X authorization. It does not create a desktop, install dependencies, configure system services, start Grok Bot or execute natural-language jobs. Wayland input, audio, clipboard synchronization, drag operations and video streaming are not supported. The default heartbeat interval is two seconds; `--interval` accepts 0.5–5 seconds. Keep the process running in a terminal or an operator-managed service.

**View desktop** requests screenshots while the viewer remains open. **Take control** enables clicks, selected keys and explicit text input against the displayed observation. The connector uses MSS for primary-monitor PNG capture and invokes xdotool with separate arguments, never a shell. Input receipts describe the dispatch result, not business success; Unicode typing depends on the X11 environment. No inbound cloud-computer port is opened. This connector authenticates possession of a deployment credential, not ownership of a Grok Bot account.

Heartbeat timestamps are assigned by the Host. A new binding is unpaired; it becomes online only after an authenticated heartbeat and offline after `computerOfflineMs` (default 20000). Screenshots and control state stay in Host memory and are omitted from the fleet response. Frames expire on the next access after viewer demand ends (`computerViewMs`, default 10000); restart and credential rotation discard the relay. `maxComputerFrameBytes` limits decoded PNG bytes (default 4194304), and JSON allowance includes base64 expansion. The browser polls the open viewer every two seconds and fleet/task records every five seconds while visible.

Only one connector instance and one unconfirmed input are allowed per binding. Inputs identify the connector instance and screenshot; stale observations, off-screen coordinates and changed payloads under the pending id are rejected. Dispatch occurs once. Missing receipts become unknown after `computerCommandMs` (default 10000) and block further input. Inspect the native desktop before rotating the credential and reconnecting; a lost response may still mean an action executed. Heartbeat expiry does not stop cloud work or retry tasks. This is a screenshot-based remote console, not a provisioned or independently verified Grok Bot desktop service.

<a id="motion-preview"></a>
## Motion preview

The default view retains the animated workstation design and task overview. **Motion preview** contains a task-state illustration separate from the remote console. It offers idle, starting, working, human handoff, complete and disconnected illustrations without connecting a computer or changing tasks. **Play sequence** advances through those six states once; selecting a state or leaving the preview stops playback. **Pause motion** freezes decorative animation. The system's reduced-motion preference disables animation and playback while keeping manual state selection available. Worker submission still requires human acceptance before the illustration displays completion.

<a id="worker-http-connector"></a>
## Worker HTTP connector

This is a deployment-owned HTTP API, not a Grokbot API or an MCP endpoint. Every request carries `Authorization: Bearer <connector credential>`. The server derives the binding from that credential; a worker cannot select another binding or workspace. Browser-origin requests are refused. Responses use `Cache-Control: no-store`; no provider credentials are returned. Configure `maxComputerBodyBytes` for JSON request limits; file uploads use the existing enterprise upload quotas and format validation.

| Method and path | Behavior |
|---|---|
| `GET /computer/v1/manifest` | Returns binding identity, operating instructions and explicitly unverified provider capabilities. |
| `POST /computer/v1/heartbeat` | Accepts the versioned connector identity, capability report, optional PNG frame and input receipt; returns viewer demand and at most one input. |
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

Provider Admin API configuration, MCP installation, multiple worker roles per computer and DSH model-driven delegation are not implemented by this module. Routine configuration and delivery records describe wakeup separately from execution. `taskPush` and `remoteStop` in the worker manifest remain `UNVERIFIED`; `embeddedDesktop` is `CONNECTOR_REQUIRED`. The [older Grokbot queue](../../packages/webhook/webhook-grokbot/README.md) is separate and is not mounted by this module.

<a id="storage-and-verification"></a>
## Storage and verification

Enterprise SQLite schema version 13 adds computer records and hashed credentials. Linked tasks, approvals, file metadata and audit events use the existing owners. Job creation and state transitions are transactions; job UUIDs are idempotency keys and reject different payloads under the same key. No changes to the Harness loop or Session format are required. File grants reference immutable asset ids; deletion removes subsequent access. Back up the entire enterprise directory while the Host is stopped.

Build with `node trade/enterprise/build.mjs`. From the repository root, run `node node_modules/vitest/vitest.mjs run --config trade/enterprise/vitest.sites.config.ts trade/enterprise/test/computer-store.spec.ts` for state and authorization checks and `node --test trade/enterprise/test/computer-browser.test.mjs` for the built `dsh` profile, HTTP connector and desktop/mobile browser workflow. Browser evidence lives under `.trade-runtime/computer-evidence/`. Tests simulate the external worker; they do not establish real Grokbot connectivity or a recorded model Session.
