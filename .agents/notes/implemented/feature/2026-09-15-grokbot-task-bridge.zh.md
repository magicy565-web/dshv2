# Agent Note：Grokbot 任务桥接

状态：已实现

## 决策

`@deepseek-ai/dsh-webhook-grokbot` 提供基于 `storageDomain` 的持久任务队列，以及供 Grokbot 云电脑 Routine 使用的签名 HTTP 拉取／回调 API。DSH 负责任务身份、幂等、租约尝试、终态和取消；Routine 负责网页操作。每个请求使用共享认证 header，回调另外使用 HMAC 签名。本包不依赖 Grokbot 私有 API，也不修改 agent loop。

## 结果

配置持久存储后，DSH 重启不会丢失队列。重复幂等键返回原任务，租约过期后可以重新领取，旧 attempt 的终态回调不能覆盖新状态。DAG 推进和 Session 结果投影由独立 Consumer 负责。
