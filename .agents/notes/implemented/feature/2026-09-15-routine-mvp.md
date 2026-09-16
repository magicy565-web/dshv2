# Agent Note: Routine MVP uses durable plans and existing background jobs

Status: implemented

English | [中文](2026-09-15-routine-mvp.zh.md)

## Decision

Routine is a Host-owned scheduled prompt that creates an independent Agent Session. It stores plan and run records in the `routine` storage domain over SQLite. The existing `schedule` package remains session-local: it does not wake cold sessions or authorize independent execution.

Routine execution is registered with `ctx.jobs`, so in-process lifecycle, cancellation, and live-owner completion notices use the existing background-job seam. Routine owns the durable plan, run status, and independent Session correlation. A cold creating Session receives no immediate notice in this MVP; its run remains durable.

The first version supports once and fixed-interval plans in one Host, with no RRULE, heartbeat continuation, cross-host lease, or Web management surface. Future additions must preserve the separation between reminder delivery and execution authorization.
