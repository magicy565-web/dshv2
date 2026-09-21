# Agent Note: Shopify Site capability seams

Status: implemented

## Problem

AI 建站需要租户安全的标识和稳定的 Provider 无关接口，才能继续接入 Shopify HTTP、OAuth、UI 和发布工作流。

## Decision

仓库新增 `@deepseek-ai/dsh-shopify`，提供租户和店铺品牌化 ID、公共/OAuth 模式解析、商品目录投影和主题发布接口。`@deepseek-ai/dsh-site` 负责租户站点版本、类型化 `SiteChangeSet`、校验和发布任务。Provider 接收显式解析后的规格；模型不会直接产生 Shopify API 请求。

## Alternatives considered

**在 Site 包内直接调用 Shopify。** 放弃，因为 OAuth、凭据、API 版本和 Provider 错误会与站点数据接口耦合。

**使用未品牌化的字符串 ID。** 放弃，因为租户和 Shopify 资源 ID 可能被错误地跨范围传递。

## Consequences

Consumer 可以基于一个类型化 seam 实现公共店铺和 OAuth 店铺。内存 Site 提供方将排队任务与执行分开，仅在提供方成功后提交独立的已发布版本，并阻止同一站点并发发布。经过身份验证的编辑器通过企业 Host 路由表暴露入队操作；工作器通过 Site 事务提供外部副作用，事务会在返回前提交最终任务状态。独立记录保证版本不可变。快照导入在替换状态前校验归属引用；中断的运行中任务变为失败，因为本地状态不能确定远程副作用。显式快照保存使用原子文件替换，但不提供自动持久提交或多进程锁。[源码项目决策](2026-09-20-site-source-projects.zh.md) 负责持久活动投影与企业发布工作器。包测试不能证明真实 Shopify 发布。
