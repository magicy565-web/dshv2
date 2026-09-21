---
description: "公共店铺和 OAuth 店铺的 Shopify 能力定义。"
kind: "package-reference"
---

# @deepseek-ai/dsh-shopify

English | 中文

## Summary

本包定义租户范围内的 Shopify 服务 seam，显式表达店铺模式、租户身份、商品目录、主题发布和不透明资源 ID。Provider 负责 OAuth 与 Shopify HTTP 细节，Consumer 先解析 `ShopifyStoreSpec` 再执行操作。

## Known Limitations and Deferred Work

- `GraphqlStoreProvider` 通过 `ShopifyGraphqlClient` 读取目录和主题。OAuth 回调、加密凭据和队列执行由企业 Host 负责；本包不处理结算。
- 主题发布接受已审核文本路径与 `OnlineStoreTheme` ID，等待返回的写入任务，提升主题并验证在线角色。异步写入要求显式轮询限制与取消信号；企业工作器将传输尝试设为一次，使不确定变更必须经过核对。开发店铺发布仍需单独验收。

## Model Experience

当前没有直接面向模型的工具；工具 schema 和 Session 事件由 Consumer 负责。

#### KV Cache effect

无。
