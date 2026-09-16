---
description: "单 Host 持久化 Routine 调度器和独立 Agent 执行器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-routine-local

[English](README.md) | 中文

该 Provider 在配置的 SQLite 后端上打开 `routine` 存储域，由 Host 持有的 timer 扫描到期计划，通过 `ctx.agents` 创建独立 Agent，并将每次执行注册到 `ctx.jobs`。它串行化存储更新，删除 Routine 后仍保留已完成的运行记录。

Provider 明确限定为单 Host，不从其他进程接管任务，也不会为了发送通知而恢复 cold 的创建者会话。
