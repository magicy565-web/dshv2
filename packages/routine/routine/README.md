---
description: "Routine service contract for durable scheduled independent Agent sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-routine

English | [中文](README.zh.md)

## Summary

Routine defines the service vocabulary for saved prompts that run in independent Agent sessions. The local provider persists definitions and run records; this package does not change the session-local Schedule reminder semantics.

The MVP supports one-time and fixed-interval plans, active/deleted routines, and queued/running/terminal run states. A Routine captures the creating Agent's model route and workspace directory so later runs do not depend on the original chat remaining open.

## Provider boundary

`@deepseek-ai/dsh-routine-local` supplies the Host service. `@deepseek-ai/dsh-tool-routine` supplies the `routine_create`, `routine_list`, `routine_delete`, and `routine_run_now` model tools. The provider uses `ctx.jobs` for process-local execution and completion delivery, while Routine storage remains durable.

## Limitations

The MVP is single-host and has no RRULE calendar plans, heartbeat continuation, automatic recovery of the creating Session, or Web management UI. Cold creating Sessions still receive durable run history, but no immediate notice.
