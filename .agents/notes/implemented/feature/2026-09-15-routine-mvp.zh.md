# Agent Note: Routine MVP 使用持久计划和现有后台 Job

Status: implemented

English | 中文

## 决策

Routine 是由 Host 持有的定时提示词，会创建独立 Agent Session。它在 SQLite 上的 `routine` 存储域中保存计划和运行记录。现有 `schedule` 仍然是会话内提醒能力，不唤醒 cold 会话，也不授权独立执行。

Routine 执行注册到 `ctx.jobs`，因此进程内生命周期、取消和 live 创建者的完成通知复用现有后台 Job seam。Routine 自己负责持久计划、运行状态和独立 Session 关联。MVP 中 cold 创建会话不会收到即时通知，但运行记录会持久化。

第一版只支持单 Host 的一次性和固定间隔计划，不支持 RRULE、heartbeat、跨 Host 租约或 Web 管理界面。后续扩展必须保持提醒交付和执行授权的职责分离。
