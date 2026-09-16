---
description: "Grokbot 云电脑 Routine 的持久任务队列与 HTTP 适配器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook-grokbot

`dsh-webhook-grokbot` 为运行在云电脑中的 Grokbot Routine 提供持久任务队列。DSH 创建任务，Routine 在下一次定时运行时领取任务，执行网页操作，再将带签名的结果回写 DSH。任务通过 `storageDomain` 保存，因此 DSH 重启后仍保留排队和终态记录。

服务配置一个路径前缀、包含共享密钥的凭据引用、请求体上限和租约时长。每个请求通过 `X-Grokbot-Auth` 发送该密钥；回调另外要求 `X-Grokbot-Signature: sha256=<hex>`。服务在此前缀下注册以下接口：

| 接口 | 用途 |
|---|---|
| `/create` | 创建任务；重复 `idempotencyKey` 返回原任务。 |
| `/claim` | 领取一个排队任务或租约已过期的任务。 |
| `/heartbeat` | 延长租约并将任务标记为运行中。 |
| `/callback` | 提交成功或失败结果；要求 `X-Grokbot-Signature: sha256=<hex>`。 |
| `/cancel` | 取消活动任务。 |
| `GET /tasks/<taskId>` | 读取任务。 |

回调必须包含 `taskId`、`callbackToken`、`attempt` 和 `status`。旧 attempt、错误 token 或已结束任务不能覆盖已提交结果。`callbackToken` 只在创建和领取时返回，应保存在 Routine 的密钥存储中。

本包不执行浏览器自动化，也不依赖 Grokbot 私有 API。网站步骤由 Grokbot Routine 负责，并由 Routine 自行执行来源、账号和操作白名单。

## 配置

```yaml
- name: '@deepseek-ai/dsh-webhook-grokbot'
  config:
    path: /grokbot
    authEnv: GROKBOT_SHARED_SECRET
    maxBodyBytes: 1048576
    leaseSeconds: 120
```

本包要求 `storageDomain`、`webServer` 和 `credentials`。生产环境应为 `grokbot_task` 域选择持久存储后端。

## 模型体验

本包不增加面向模型的工具或提示词。任务和结果由程序化调用方消费，并可由调用方投影到已有 Session。

## 已知限制与后续工作

- 第一版使用 HTTP 拉取和回调，不假定 Grokbot 公开 API 或主动唤醒能力。
- DAG 调度和结果专用 Session 事件由 workflow 集成负责。
- 租约在 worker 调用 `claim` 时清理；需要主动过期指标时再增加独立清理器。
