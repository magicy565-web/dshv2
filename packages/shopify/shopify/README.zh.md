---
description: "公共店铺和 OAuth 店铺的 Shopify 能力定义。"
kind: "package-reference"
---

# @deepseek-ai/dsh-shopify

English | 中文

## Summary

本包定义租户范围内的 Shopify 服务 seam，显式表达店铺模式、租户身份、商品目录、主题发布和不透明资源 ID。Provider 负责 OAuth 与 Shopify HTTP 细节，Consumer 先解析 `ShopifyStoreSpec` 再执行操作。

## Known Limitations and Deferred Work

- 当前不包含 Shopify HTTP 客户端、OAuth 回调、token 加密、webhook 注册或结算功能。
- 商品和主题投影不会把 Shopify 原始 ID 暴露给 Consumer。

## Model Experience

当前没有直接面向模型的工具；工具 schema 和 Session 事件由 Consumer 负责。

#### KV Cache effect

无。
