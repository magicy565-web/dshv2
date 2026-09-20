# Agentive Commerce MVP：增量架构

[English](PLAN.md) | 中文

## 范围

需求侧仅服务已有业务的小品牌和独立零售商。公开 Marketplace、Partner、Distributor、OpportunityClaim、CRM、Quote/Order 流水线不在本轮范围。闭环为 Factory → Passport → Opportunity → Merchant Profile → 私密匹配 → Sample → Launch → Shopify Draft → 审批发布 → Performance → STOP / ITERATE / SCALE。

## 现有模块盘点

| 模块 | 已有能力 | 处理 |
| --- | --- | --- |
| `trade/enterprise` | 企业、GEO 草稿、文档提取、证据、SQLite | 原入口通过已认证 API 传输映射事实与来源；文件和店铺连接仍由原模块拥有 |
| `opportunities.ts` | 买家研究和跟进 | 不用作 ProductOpportunity |
| `shopify*.ts` | OAuth、加密、Webhook、商品同步 | 保留；新应用使用店铺绑定及 Admin GraphQL |
| `site-*.ts`、`computer-*.ts` | 网站与云电脑 | 不扩展，不作为必需依赖 |
| `packages/sdk/client` | 官方 stdio JSON-RPC SDK | 只由 Runtime Provider 使用，固定 `0.1.5-rc.2` |
| Harness Web UI | 已有插件界面 | 企业空间挂载共用 Commerce React 控件；Next.js 保留独立入口及业务 API 服务 |

## 数据及 API

新增 `trade/commerce`，复用 Next.js、React、Zod、Node SQLite 和官方 SDK。`Product App → AgentGateway → AgentRuntime → DeepSeekRuntime` 与 `Product App → CommerceService → commerce.sqlite` 分开。业务代码不依赖 Session 格式；Core 与现有企业数据库保持独立。

Company、Product、ProductPassport、Evidence、ProductOpportunity、Merchant、MerchantBusinessProfile、OpportunityMatch、SampleRequest、ShopifyListing、Artifact、Launch、PerformanceSnapshot、Activity、Approval 各有独立表。事实包含 value、status、visibility、evidenceIds。可信度与公开范围分开；UNKNOWN 必须为空；模型不得确认事实。Opportunity、Listing、Artifact 引用 Passport 版本。来源修订、撤销、过期使推荐或审批失效。Launch 固定当时供货成本。

| API | 行为 |
| --- | --- |
| GET `/api/workspace` | 按工厂或 Merchant 身份过滤的业务投影 |
| GET `/api/manifest` | 版本、命令 Schema、READ / DRAFT / EXECUTE 分类 |
| GET `/api/products/readiness?id=…` | 所属工厂的缺失字段 |
| POST `/api/commands` | Schema、授权、版本、幂等和事务审计 |
| POST `/api/integration/open`、`/api/integration/resume`、`/api/integration/exchange` | 服务端认证后刷新来源或打开已保存资料；一次性连接码交换有范围限制的浏览器会话 |
| POST `/api/integration/dispatch` | 原生企业控件通过部署认证转发封闭路由；绑定人类角色，不接受任意主体或 URL |
| POST `/api/agent/check` | 发送最小模型请求，空响应不视为成功 |
| POST `/api/shopify/stores`, `/api/shopify/publications`, `/api/shopify/select` | 读取原店铺、发布渠道，本人绑定后续 Launch |
| POST `/api/agent`、`/api/agent/apply` | 生成建议；以 Agent 权限应用草稿 |
| POST `/api/shopify/catalog`、`/api/shopify/draft` | 读取绑定店铺前 50 个商品/集合；写 DRAFT |
| POST `/api/shopify/publish`、`/api/shopify/reconcile` | 执行确切版本审批；只读核查不确定结果 |

每个业务命令携带 requestId；修改携带 expectedRevision。重复相同请求返回原结果，换内容复用 id 则冲突。服务端配置决定身份，客户端不能指定角色。外部 Plugin 提供 create_company、ingest_company_source、create_product、update_product_fact、get_missing_fields、build_opportunity，只访问 API。业务请求需要 Bearer 认证，接续交换需要有效的一次性连接码；没有公开浏览入口。

## 页面及状态机

工厂：概览、企业、产品、机会、样品响应。Merchant：概览、为你推荐、样品、新品测试。公共：Ask Workbuddy、设置。首页显示业务数据；推荐解释包含适配依据、商业信息、风险和 UNKNOWN。

| 对象 | 状态 |
| --- | --- |
| Readiness | DRAFT / DATA_INCOMPLETE / COMMERCIAL_INCOMPLETE / OPPORTUNITY_READY / PAUSED，后台计算 |
| Opportunity | DRAFT → AVAILABLE ↔ PAUSED，要求当前资料合格 |
| Match | NONE → SAVED / NOT_INTERESTED；拒绝原因保留，同产品不重复推荐 |
| Sample | REQUESTED → CONFIRMED → SHIPPED → DELIVERED → ACCEPTED；请求或交付可 REJECTED；发货前 Merchant 可 CANCELLED |
| Launch | PREPARING → READY → LIVE → SCALE / STOPPED；ITERATE 记录意向，保留状态 |
| Approval | PENDING → APPROVED / REJECTED；APPROVED → EXECUTING → EXECUTED / UNCERTAIN |
| Listing | PREPARED → DRAFT → PUBLISHED；额外记录草稿同步操作状态 |

Launch 的 PAUSED 只预留，当前没有暂停店铺命令。STOP 不自动下架商品。发布结果不确定时阻止来源编辑，核查不重复发布。

## Migration 顺序

独立 SQLite 通过事务递增 user_version，拒绝未知高版本，不自动迁移旧企业数据。

1. Company、Product、Passport、Evidence、Activity、幂等回执。
2. Opportunity、Merchant、BusinessProfile、Match。
3. Sample、Launch、Listing、Artifact。
4. PerformanceSnapshot、Approval。
5. 来源导入回执和只保存哈希、有有效期的连接码/会话凭证。
6. 会话身份、Merchant 当前店铺与 Launch 固定店铺引用；不保存 Shopify Token。

## E2E 与缺口

隔离测试验证 20 个产品、3 个具备基础资料、1 个可推荐机会，随后完成匹配、样品验收、草稿、审批、模拟发布、销售记录、决策及重启读取。负向验证包括越权、推测晋升、UNKNOWN、证据撤销、过期版本、错误币种、非法跳转、幂等冲突和发布结果不确定。Provider wire tests 验证 Shopify 请求字段。

真实工厂、模型、Shopify 验收仍未完成。当前匹配使用透明规则与解释，Workbuddy 可提出上下文建议；持久化 LLM 匹配分析尚缺。独立 Commerce 自助 OAuth（已复用原企业授权）、原始 PDF/Web 上传提取、真实图片渲染、Shopify 表现自动读取、目录分页及写入已有集合尚缺。当前每个 Launch 生成 2 个图片简报和 8 个文本草稿；表现为带来源的 MERCHANT_REPORT，缺失指标保持 null。该增量不代表完整商业 MVP 已验收。
