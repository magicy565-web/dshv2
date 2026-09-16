---
description: "结构化站点的重试和幂等发布工作流。"
kind: "package-reference"
---

# @deepseek-ai/dsh-site-workflow

English | 中文

## Summary

`SitePublishWorkflow` 解析租户站点和 Shopify 连接，生成受控版本文件，以稳定幂等键发布，记录每次尝试，有限重试失败并发出审计事件。

工作流将 Shopify 副作用传给 `SiteService.runPublishJob`，因此 Site 服务会在返回结果前提交 `running`、`succeeded` 或 `failed` 状态。Provider 成功后会推进 `publishedRevisionId`；重试耗尽时保留之前的发布版本。

## Publication configuration

发布只接受状态为 queued 且站点与版本匹配的任务；不匹配会在调用提供方前失败。

选项要求显式指定 `themeId` 和 HTTP(S) `publicOrigin`。工作流将版本与存储状态核对，解析租户所属连接，并拒绝不存在的所选主题。只有分类为 transient 或 rate-limit 的 `ShopifyApiError` 会重试。权限错误和未知错误立即停止。审计回调失败向调用方传播，不会重复已成功的提供方发布。尝试历史仅保存在当前进程，返回独立记录。

## Known Limitations and Deferred Work

- 当前渲染器生成静态 HTML、robots、sitemap 和 JSON 版本文件。这些文件不是 Shopify 主题；生产适配器必须在真实发布前将批准内容转换为 Shopify 主题模板。
- 持久化尝试记录、分布式锁和自动回滚由部署侧负责。

## Model Experience

当前没有直接面向模型的工具。

#### KV Cache effect

无。
