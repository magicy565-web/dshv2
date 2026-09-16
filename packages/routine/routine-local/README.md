---
description: "Single-host durable Routine scheduler and independent Agent executor."
kind: "package-reference"
---

# @deepseek-ai/dsh-routine-local

English | [中文](README.zh.md)

This provider opens the `routine` storage domain over the configured SQLite backend, scans due plans from a Host-owned timer, creates independent Agents through `ctx.agents`, and registers each execution with `ctx.jobs`. It serializes storage updates and keeps completed run records after a Routine is deleted.

The provider is intentionally single-host. It does not claim work from another process and does not resume a cold owner Session for notification.
