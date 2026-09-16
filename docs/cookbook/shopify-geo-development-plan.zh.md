# Shopify-GEO 开发计划

[English](shopify-geo-development-plan.md) | 中文

本计划定义 Workspace 驱动 Shopify-GEO 产品流程的剩余实现工作。Enterprise 包已提供结构化就绪检查、认证预览、公开 HTML/JSON-LD 投影、Shopify OAuth、Webhook 校验、有界同步重试和独立站点发布。Workspace 负责产品事实、证据、人工核验、店铺选择、发布审批、重试和审计记录。Shopify 负责价格、库存和可售状态等商业状态。

## 1. GEO 产品数据

为变体增加 SKU、MPN、GTIN、选项、规格和媒体等结构化身份字段。每种语言保留一个稳定产品 slug 和一个 canonical URL。按字段记录核验人、时间、来源 ID 和产品版本。旧自由文本记录标记为 `structured_product_missing`；不得猜测缺失的商业信息或标识符。

## 2. Readiness 与发布

独立评估 Entity、Understanding、Facts、Evidence、Site Publication、Discovery 和 Shopify Sync。Discovery 必须实际检查公开路由、HTTP 状态、canonical URL、robots、Sitemap、JSON-LD 与 HTML 一致性以及私有字段过滤。站点发布独立于 Shopify Commerce Sync。产品只有完成人工核验并成功发布站点后才能进入公开投影。

## 3. 公开投影

使用同一个类型化投影生成可见 HTML 和 JSON-LD。来源字段公开且已核验时，生成 `Product`、`Organization`、`Brand`、`ProductGroup`、`ProductVariant` 和 `PropertyValue`。`Offer` 只能使用 Shopify 返回的价格和可售状态。为已有语言生成成对的 `hreflang` 链接。下架产品从 Sitemap 移除，并返回规定的不可用状态。

## 4. Shopify 连接和任务

通过 `StoreConnection` 统一 managed 店铺和用户 OAuth 店铺。校验 OAuth state、回调 HMAC、redirect URI 和 offline token 交换。凭据加密保存。为产品版本创建稳定幂等键的 `PublishJob`，记录有限重试、并发保护、尝试错误和审计事件。解析 Webhook 前先验证 HMAC，按 delivery ID 去重并忽略过期的外部更新。

## 5. Workspace 流程

增加产品 readiness、证据审核、版本比较、站点预览、店铺选择、发布、下架、重试和发布历史界面。私有事实和证据不得进入公开响应。Shopify Commerce 状态必须和 Shopify-GEO Site 状态分开显示。

## 6. 验证

增加旧记录和发布字段的 SQLite 迁移测试。增加 Host 测试，覆盖 readiness 阻断、slug 冲突、站点发布、下架、OAuth 失败、Webhook 去重、重试分类和 Shopify 状态投影。增加浏览器测试，覆盖未登录产品页、HTTP 状态、canonical、`hreflang`、JSON-LD 一致性、私有字段过滤、移动端布局、robots 和 Sitemap。发布前运行文档配对、包类型检查、lint 和 Enterprise 定向测试。

## 7. 外部验收

使用 Shopify 测试店和 HTTPS 部署创建一个包含两个变体的产品组。验证 Workspace 审批、Shopify 字段、返回的价格和可售状态、公开 HTML、JSON-LD、Rich Results 解析、Search Console 抓取能力和 Merchant Center 字段一致性。只记录实际执行结果；凭据保留在部署配置中。
