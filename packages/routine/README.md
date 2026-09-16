---
description: "Routine capability packages for durable scheduled independent Agent sessions."
kind: "package-group"
---

# routine/ — scheduled independent sessions

English | [中文](README.zh.md)

The Routine group provides a Host-owned scheduled prompt capability. `routine` defines the service and durable vocabulary, `routine-local` runs plans on one Host, and `tool-routine` exposes the model-facing management tools. It is separate from `schedule`, whose reminders remain local to a live Session.

| Package | Role |
|---|---|
| [`routine/`](routine/README.md) | Service Definition and Routine/Run vocabulary |
| [`routine-local/`](routine-local/README.md) | SQLite-backed scheduler and independent Agent executor |
| [`tool-routine/`](tool-routine/README.md) | `routine_create`, `routine_list`, `routine_delete`, `routine_run_now` |
