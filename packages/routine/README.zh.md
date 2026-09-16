---
description: "持久化定时独立 Agent 会话的 Routine 能力包。"
kind: "package-group"
---

# routine/ —— 定时独立会话

[English](README.md) | 中文

Routine 组提供由 Host 持有的定时提示词能力。`routine` 定义服务和持久化词汇，`routine-local` 在单 Host 上执行计划，`tool-routine` 暴露面向模型的管理工具。它独立于 `schedule`，后者仍然只负责 live Session 内提醒。

| 包 | 作用 |
|---|---|
| [`routine/`](routine/README.zh.md) | Service Definition 和 Routine/Run 词汇 |
| [`routine-local/`](routine-local/README.zh.md) | SQLite 调度器和独立 Agent 执行器 |
| [`tool-routine/`](tool-routine/README.zh.md) | `routine_create`、`routine_list`、`routine_delete`、`routine_run_now` |
