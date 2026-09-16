---
description: "持久化定时独立 Agent 会话的 Routine 服务约定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-routine

[English](README.md) | 中文

## 摘要

Routine 定义保存提示词并在独立 Agent 会话中执行的服务词汇。本地 Provider 保存任务定义和运行记录；本包不改变会话内 Schedule 提醒的语义。

MVP 支持一次性和固定间隔计划、活动/删除状态以及排队、运行和终态。Routine 保存创建 Agent 的模型路由和工作目录，因此后续运行不依赖原聊天保持打开。

## Provider 边界

`@deepseek-ai/dsh-routine-local` 提供 Host 服务，`@deepseek-ai/dsh-tool-routine` 提供 `routine_create`、`routine_list`、`routine_delete` 和 `routine_run_now` 工具。Provider 使用 `ctx.jobs` 承载进程内执行和完成通知，同时单独持久化 Routine 数据。

## 限制

MVP 只支持单 Host，不支持 RRULE 日历规则、heartbeat 跟进、自动恢复创建 Routine 的会话或 Web 管理界面。创建会话处于 cold 状态时仍保留运行历史，但不会立即发送通知。
