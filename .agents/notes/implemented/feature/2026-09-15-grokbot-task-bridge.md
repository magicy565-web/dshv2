# Agent Note: Grokbot task bridge

Status: implemented

## Decision

`@deepseek-ai/dsh-webhook-grokbot` provides a durable `storageDomain` task queue and a signed HTTP pull/callback API for Grokbot cloud-computer Routines. DSH owns task identity, idempotency, lease attempts, terminal state, and cancellation; the Routine owns browser actions. Every request uses the shared authentication header, and callbacks additionally use an HMAC signature. The package does not depend on a private Grokbot API or modify the agent loop.

## Consequence

The queue survives DSH restarts when the configured storage backend is durable. A repeated idempotency key returns the original task, expired leases can be claimed again, and terminal callbacks cannot be overwritten by stale attempts. DAG progression and Session-specific result projection remain separate consumers.
