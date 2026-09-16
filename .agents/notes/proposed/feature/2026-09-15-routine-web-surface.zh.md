# Agent Note: Routine Web 界面与 Host API

Status: proposed

[English](2026-09-15-routine-web-surface.md) | 中文

## Problem

Routine 保存在 Host 的 SQLite domain 中，而 Web 客户端只能读取 `routine` projection。没有 Host Remote API 和全局 projection，客户端无法列出 Routine、显示运行历史或执行管理操作。

## Proposal

新增 Host 持有的 Routine Remote namespace 和浏览器安全 projection，通过 API gateway 暴露 `list`、`get`、`create`、`runNow` 和 `delete`。Host 校验 owner Session，只返回 Routine 计划和最近 Run 的浏览器安全视图。完善 `ui-routine` 为 Routine Center，提供列表、详情、创建、立即运行、删除和独立 Session 导航。Web bundle 默认关闭，只有 Host provider、Remote 和 projection 同时存在时启用。

## Host API and projection

Remote 操作使用 `routines.list()`、`routines.get()`、`routines.create()`、`routines.runNow()` 和 `routines.delete()`。每次读取和变更都校验所有权；`runNow` 不改变 `nextRunAt`。持久化写入和 Run 状态变化完成后刷新全局 projection；缺少 projection、加载中和传输失败保持为不同 UI 状态。

## Client behavior

Routine Center 使用现有 header slot、locale、锚定弹层、Session 导航和主题 token，显示名称、提示词摘要、计划、下次运行、最近状态和完成时间。创建对话框校验非空内容、未来时间和至少五分钟的间隔。Remote 调用期间禁用控件并显示错误；重连后读取权威列表。cold creator Session 只查看保存结果，不因通知被恢复。

## Alternatives considered

**浏览器直接读取 SQLite。** 否决，因为会绕过 Host 授权并重复存储解析。

**使用 Session 事件保存 Routine。** 否决，因为 Routine 是 Host 全局状态，必须独立于 Session-local Schedule 事件流。

**只提供模型工具。** 否决，因为用户需要无需模型请求即可查看计划和运行结果。

## Acceptance criteria

- 客户端只能看到目标 Session 所有的 Routine。
- 创建、删除和立即运行通过 Host Remote，并保持计划语义。
- 重连或完成后运行状态和摘要无需刷新页面即可更新。
- UI 覆盖加载中、空列表、错误、运行中、完成、失败、中断和删除状态。
- Run 可跳转独立 Session，且不会恢复 cold creator Session。
- Schedule 和 Jobs 行为不变；Remote、projection、UI、locale 和 Web replay 测试通过。

## Risks

Provider 若绕过刷新路径会造成过期 projection，因此必须以持久化完成触发刷新并测试重连 baseline。Remote 需要稳定的所有权错误和有界运行历史。首版继续限制为单 Host，不包含多 Host lease、通知 outbox 和完整历史分页。
