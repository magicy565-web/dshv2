# Commerce Workspace

[English](README.md) | 中文

## 概述

整理有来源的工厂产品，向小品牌私密匹配，验收样品，创建 Shopify 草稿并审批新品测试。业务数据持久化于独立 SQLite。详见[范围、API、状态机和迁移方案](PLAN.md)。

## 目录

- [本地运行](#run-locally)
- [连接](#connections)
- [MCP 建档](#mcp-onboarding)
- [验证与限制](#verification-and-limits)

<a id="run-locally"></a>
## 本地运行

在本独立工作区目录使用 Node 24.13+ 和 pnpm：

```sh
pnpm install
pnpm run setup:local
pnpm run build
pnpm start --port 3100
```

打开 `http://127.0.0.1:3100`。初始化生成被忽略的 `.env.local` 和 `data/local-access.json`，包含四个独立的人类/Agent Token；在登录页使用工厂或 Merchant 的人类 Token。初始化拒绝覆盖已有配置，不安装虚构业务数据。不得将人类 Token 交给 Agent。

工厂建立 Company 和 Product 草稿，确认事实、授权公开并准备机会。Merchant 在设置中确认资料，运行匹配、申请样品，并在收到且接受样品后准备 Launch。

接续已有本地企业时，在初始化后于本目录运行 `node scripts/connect-enterprise.mjs`，重启 Commerce 与 [Trade 部署](../README.zh.md)。在 3080 打开“企业空间 → 继续产品商业化”。Host 传输当前目录，并将共用业务控件挂载在企业空间内。导航保持在 3080，原侧栏与登录状态继续可用。配置脚本保留匹配的已有绑定、添加明确的品牌身份映射、拒绝冲突身份，并为固定版本 SDK 配置 `sdk` profile，使用已有 `.trade-runtime` 目录。在同一入口选择“进入品牌新品测试”可接续绑定的品牌身份。“返回原企业空间”关闭业务面板，不刷新整个应用。模型凭证仍需配置；“设置 → 检测模型连接”发送简短推理请求并拒绝空响应。

连接将已映射企业字段和当前 GEO 产品事实导入为私密、未确认的 Commerce 事实。证据及回执保留原记录 ID、版本、审阅时间和引用。它不复制文件、不传输 Shopify 凭证，也不替换企业记录。重新进入时更新快照：来源未变则保留确认，来源变化使导入证据失效，来源删除则撤销证据。本地值冲突会回滚刷新；“仅打开已保存的商业化资料”允许继续进入核对。不支持后台同步或双向写回，确认商业用途前需核对来源。

<a id="connections"></a>
## 连接

[服务端 Schema](src/server.ts) 验证 JSON 格式的 COMMERCE_CONFIG：database、credentials、maxBodyBytes、matchLimit、shopify 和可选 runtime/enterprise/enterpriseStore。企业绑定固定 factoryId、可选 merchantId、returnUrl、服务端凭证及连接码/会话有效期。[Trade 启动脚本](../dev.ps1) 读取被忽略的 `.trade-runtime/commerce-link.json`，已提供 DSH_COMMERCE_LINK_SECRET_JSON 时则使用该变量。内嵌面板调用已认证的企业 API；仅 Host 向封闭的 Commerce 分发接口传递服务器凭证。分发接口从部署绑定固定主体 ID，并执行普通业务授权及确切版本审批检查。直接独立访问的连接码仍只可使用一次；Token 哈希会过期，绑定变化也使其失效。Shopify 配置将 merchantId 绑定至 domain、accessToken、apiVersion、publicationId、timeoutMs、maxResponseBytes。没有企业店铺连接的部署仍可使用此直接配置。

配置 enterpriseStore 后，“设置 → 读取已有店铺”读取原 Host 的连接。本人选择店铺和发布渠道，Shopify Token 仍加密保存在原所有者中。封闭的 `/commerce/v1/shopify` 接口仅接受部署凭证及绑定的品牌身份，拒绝浏览器 Origin，并在每次调用时检查当前连接状态、权限与凭证。托管 Token 必须匹配确切配置的店铺域名。Launch 在首次草稿尝试前固定店铺和渠道，切换后续店铺不会改变已审批测试的目标。已有远端商品却缺少绑定时需要管理员核对。配置品牌连接后，从原 OAuth 入口重新授权会申请商品与发布渠道权限；既有授权不会自动扩展。渠道读取遵循 Shopify [2026-01 publications API](https://shopify.dev/docs/api/admin-graphql/2026-01/queries/publications)，显示前 50 个目标。

使用模型操作时，企业 timeoutMs 应大于 Runtime requestTimeoutMs；新建本地连接使用 150 秒。Runtime 配置指定提供 SDK 服务的 dsh profile、provider、model、dshHome、processCwd、requestTimeoutMs、maxTokens。请配置仅提取资料且没有 shell/computer 工具的 profile。子进程只接收显式环境变量白名单，不含业务和 Shopify 凭证。官方 SDK 固定为 `0.1.5-rc.2`；未配置时返回 `runtime_not_configured`，普通业务 API 仍可使用。品牌理解将所选店铺目录作为不可信来源读取，提出待审阅草稿，不自动确认品牌资料。

[Plugin](plugins/commerce-workbuddy/.codex-plugin/plugin.json) 使用 COMMERCE_API_URL 和 COMMERCE_AGENT_TOKEN。[建档 Skill](plugins/commerce-workbuddy/skills/factory-intake/SKILL.md) 通过宿主读取材料并调用 API。安装到 Codex/Workbuddy 是独立操作，尚未执行。

Shopify 导入使用 DRAFT。发布审批绑定确切 Launch/Listing 版本。不确定的发布需要只读核查，并阻止来源编辑。不确定的草稿按稳定 Launch handle 重试；中断在 DRAFTING 状态时当前需管理员检查。适配器遵循 Shopify [productSet](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet) 和 [publishablePublish](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish)；真实店铺验证仍待完成。

<a id="mcp-onboarding"></a>
## MCP 建档

外部 MCP 客户端连接 `/mcp` 后，可以建立有来源的供应商企业和产品草稿。客户端负责模型、对话及文档读取；Commerce 的这些工具无需配置模型运行时。记录保存到本工作区的 Company、ProductPassport 和 Evidence 中，不写回原企业空间的 GEO 记录。

启动 Commerce 后，在 Workbuddy 的远程 MCP 设置中填写以下连接信息。接口已用官方 MCP 客户端验证；Workbuddy 当前设置界面和授权接入仍需在客户端验证。

| 设置 | 值 |
| --- | --- |
| 传输 | Streamable HTTP，JSON 响应 |
| 本地地址 | `http://127.0.0.1:3100/mcp` |
| Authorization 请求头 | `Bearer <factory-agent token>`，凭据来自私有的 `data/local-access.json` |

在客户端连接设置中配置凭据，不要发送到对话中。每个供应商需要在 `COMMERCE_CONFIG.credentials` 中拥有独立的 `factory-agent` 凭据和 `subjectId`。接口拒绝人类和品牌身份的凭据。这些部署绑定不实现自助注册或 OAuth；修改后需要重启服务。

远程使用时，由可信反向代理提供 HTTPS，并把外部域名及所需端口加入 `COMMERCE_CONFIG.mcp.allowedHosts`。默认只允许 `localhost`、`127.0.0.1` 和 `[::1]`，端口不限；包含端口的配置项仅匹配确切地址。`mcp.allowedOrigins` 默认为空数组：请求携带 Origin 时，必须精确匹配获准的来源。代理须保留外部 Host、限制上游直接访问，并执行商家请求及存储额度。请求体沿用 `maxBodyBytes`。每个请求独立认证；接口不保留 MCP 会话或独立事件流，因此 GET 和 DELETE 返回 405。

让客户端先读取 `trade_get_context`，再调用 `trade_start_onboarding`。使用 `trade_add_source` 保存提取的文字，在 `trade_save_company` 和 `trade_save_products` 中引用其不可变 ID 及确切原文片段。重连后可用 `trade_get_source` 恢复文字。本地路径和网址只作为来源标记，服务器不会读取或抓取。二进制上传、OCR 和网页提取仍由客户端负责；大文档按具名文字来源拆分，保持在请求限制内。

草稿工具只接受值和引用，不接受核验状态或公开权限。缺失值保留为 null。`trade_get_missing_fields` 区分缺失信息与尚未核验的信息。产品批次原子提交。只有重试相同命令时才复用 `requestId`；保留来源及产品 ID，并传入已读取版本。来源文字不能覆盖，更正资料使用新来源 ID。文字和引用属于客户端提交的证据，不代表独立核验。

`trade_submit_onboarding` 保存确切的企业与所选产品版本，并返回回执及工作区地址。企业和所选产品需要有来源的名称；产品数组为空时，明确表示只提交企业。未知的选填商业信息不阻止提交。修改草稿、添加资料、所选版本过期或名称证据撤销及过期都会使进度重新变为未完成。提交不确认事实、不授权共享，也不发布产品；人工审阅仍在工作区完成。[MCP 建档决策](../../.agents/notes/implemented/feature/2026-09-21-trade-mcp-intake.zh.md)记录归属和恢复语义。

<a id="verification-and-limits"></a>
## 验证与限制

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

独立 Next.js 入口与企业面板共用 React 控件及有范围限制的 CSS。浏览器投影只包含业务类型；企业 Client 不导入数据库或 SDK 实现。生产类型检查覆盖独立应用，tsconfig.tests.json 使用仓库源码映射及 vendor 项目引用检查跨工作区测试。

合成场景测试业务持久化，并在记录收入后重新打开 SQLite。负向检查覆盖授权、来源有效性、版本、重试和审批恢复。Shopify 测试注入 Provider 或传输替身，不创建真实商品、物流或收入。

`pnpm test` 包含脚本化的官方 MCP 客户端、录制工具目录及数据库重启检查。执行 `pnpm run build` 后，`node --test test/mcp-built.test.mjs` 在系统分配的端口和私有数据库上验证构建后的 `/mcp` 路由。测试独立于工具返回值检查持久化，不需要模型凭据。这些检查不证明真实 Workbuddy 的提取质量或公网部署已经完成。

匹配采用私密结构化筛选和明确解释，没有预测评分。毛利估算不含运费、关税、平台费和退货。表现为带标签的 Merchant 报告，缺失浏览/加购数据保持 null；不能直接合计不同币种收入。每个 Launch 生成两个图片简报和八个文本草稿，图片渲染与品牌语气生成尚未完成。其他缺口见方案。停止服务器后备份 SQLite；部署 Token 映射不是生产身份系统。

## Dev Note

无。
