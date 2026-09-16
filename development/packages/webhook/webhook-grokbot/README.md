---
description: "Durable task queue and HTTP adapter for Grokbot cloud-computer Routines."
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook-grokbot

`dsh-webhook-grokbot` exposes a durable task queue for a Grokbot Routine running in a cloud computer. DSH creates a task, the Routine claims it on its next scheduled run, and the Routine posts a signed result back to DSH. The service stores tasks through `storageDomain`, so queued and terminal records survive a DSH restart.

Configure the service with an exact path prefix, a credential reference containing the shared secret, a request body limit, and a lease duration. Every request sends `X-Grokbot-Auth` with that secret; callbacks additionally send `X-Grokbot-Signature: sha256=<hex>`. The service registers these endpoints below the prefix:

| Endpoint | Purpose |
|---|---|
| `/create` | Create a task; repeated `idempotencyKey` returns the original task. |
| `/claim` | Claim one queued or expired lease. |
| `/heartbeat` | Extend a lease and mark the task running. |
| `/callback` | Commit a succeeded or failed result. Requires `X-Grokbot-Signature: sha256=<hex>`. |
| `/cancel` | Cancel an active task. |
| `GET /tasks/<taskId>` | Read one task. |

The callback includes `taskId`, `callbackToken`, `attempt`, and `status`. A callback for an old attempt, an invalid token, or a terminal task cannot overwrite the committed result. `callbackToken` is returned only by `create` and `claim`; keep it inside the Routine secret store.

This package does not automate a browser and does not depend on a private Grokbot API. The Grokbot Routine owns website steps and must enforce its own origin and account allowlists.

## Configuration

```yaml
- name: '@deepseek-ai/dsh-webhook-grokbot'
  config:
    path: /grokbot
    authEnv: GROKBOT_SHARED_SECRET
    maxBodyBytes: 1048576
    leaseSeconds: 120
```

The package requires `storageDomain`, `webServer`, and `credentials`. Use a persistent storage backend for the `grokbot-task` domain in production.

## Model Experience

The package adds no model-facing tools or prompt text. Tasks and results are consumed by programmatic callers and can be projected into an existing Session by the caller.

## Known Limitations and Deferred Work

- The first provider is HTTP pull plus callback; no direct Grokbot API or push wake-up is assumed.
- DAG scheduling and result-specific Session events remain owned by the workflow integration.
- Lease cleanup is performed when a worker calls `claim`; a separate sweeper can be added when the deployment needs proactive expiration metrics.
