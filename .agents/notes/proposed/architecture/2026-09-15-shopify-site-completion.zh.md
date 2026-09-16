# Agent Note: Shopify Site and Agentive Shopping completion plan

Status: proposed

## Problem

仓库已经有 Shopify、Site、发布工作流、Cart、OAuth 和 Agentive Shopping 接口，但还缺少从授权、租户站点编辑、发布、购物、订单支持到 Web UI 的持久化应用链路。

## Proposal

按层完成能力。先增加 OAuth HTTP 路由、加密 offline token、连接健康、重复安装/撤销/卸载处理、真实 Admin GraphQL 和 Storefront API Provider、按市场的目录和 Cart 操作、认证 webhook 接收、去重、乱序保护和有限重试。

接着持久化 `Tenant`、`Site`、`StoreConnection`、`ProductBinding`、`SiteRevision`、`PublishJob`、`PublishAttempt` 和 `AuditEvent`，在存储与服务中执行租户过滤，并增加版本锁、幂等、重启恢复、不可变版本、预览差异、受控主题渲染、回滚和 Provider 映射。

然后实现 Agentive Shopping 的报价快照、市场定价、库存新鲜度、明确购买确认、checkout handoff、Customer Account 授权、订单状态、取消、退款、退货、履约、争议和人工客服路径。通过版本化认证 manifest 发布渠道能力，并声明动作、市场、scope、限流、确认、保留、灰度、撤销和 kill switch。

增加 `apps/web` Site 工作区，覆盖连接、AI 编辑、商品绑定、预览、差异、发布、购物推荐、Cart 确认、checkout handoff 和订单支持。界面从持久化投影与 locale 字典渲染。

增加公共店铺订单归属、平台服务费、结算批次、运营审核、审计查询、配额、监控、数据删除和安全评估。税务、支付、退款、消费者权益、库存、结算和争议审批完成前，公共店铺真实支付保持关闭。

## Alternatives considered

**先做 Web UI 再做持久化服务。** 放弃，因为 UI 状态会成为第二个事实来源，无法支持重启恢复和可审计发布。

**用 Admin API 处理购物者 Cart。** 放弃，因为买方 Cart 和 checkout 属于 Storefront API，Admin 操作属于商家授权。

**把 API 成功当作生产准备完成。** 放弃，因为支付、税务、退款、隐私、订单归属和结算需要非技术审批。

## Acceptance criteria

- 开发店铺完成 OAuth、目录同步、按市场创建 Cart、明确确认、checkout handoff、webhook 处理和订单状态查询。
- 两个租户不能读取或修改彼此的连接、站点、商品、Cart、版本、任务或订单。
- 重启后可以从持久化数据和 Session 事件恢复草稿、确认、发布尝试、Cart 状态和订单投影。
- 并发发布被拒绝或合并，重试有上限，超时不会重复订单或发布。
- 发布失败不改变草稿和上一个已发布版本，回滚创建新的不可变版本。
- Web UI 通过桌面/移动端流程测试和 keyless Session replay。
- 评估覆盖过期报价、市场差异、Cart 过期、重复投递、恶意商品文案、未授权操作和渠道撤销。
- 合规决定被记录前，公共店铺真实支付保持关闭。

## Risks

Shopify API 版本、scope、Cart 字段、checkout 行为、webhook topic 和 Agent 渠道协议可能变化。Provider 必须固定版本和 scope，发布前重新阅读官方文档，并对开发店铺或 `mock.shop` 运行集成测试。
