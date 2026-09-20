# 企业空间插件

[English](README.md) | 中文

这个私有部署插件通过原生侧栏和主面板 Slot（插槽）提供**企业空间**。它复用 Harness 的认证、语言词典、React 基础组件及浏览器模块加载器。SQLite 保存本地记录；`file-type`、Zod 和 `range-parser` 分别提供文件识别、输入校验和媒体范围读取。

## 用户记录

### 对话建档

企业档案尚未建立时，企业空间只提供**开始产品 GEO**。按钮打开新会话并发送原生 `/product-geo` 调用，加载随插件提供的 [skill](skills/product-geo/SKILL.md)。固定顺序为检查已有记录、了解业务、收集来源、完善草稿和在聊天内请求确认。问题与档案章节根据用户业务生成，不使用行业表单。已有企业档案保留**产品 GEO**入口。

本地部署的 SQLite `enterprise_geo` 表保存企业和产品草稿、来源、待回答问题、版本和调用会话标识。聊天确认服务收到用户回答后才确认；过期确认不能提交已修改内容。仅在企业基础档案不存在时，确认操作创建基础档案。GEO 章节保持私有，不进入现有机器读取投影。此本地部署不提供租户隔离，确认也不代表商业认证或公开发布。

构建产物测试验证原生 skill 加载、草稿持久化、拒绝及过期确认和动态字段。浏览器测试验证单按钮入口与聊天跳转；这些测试不能证明真实模型完成多轮建档或录制会话回放。

**继续建档**在浏览器刷新后重新打开已保存的会话；会话不可用时才创建新会话，并由 skill 读取保存的进度。已确认档案可以建立独立修订草稿，原内容不会丢失。完成建档需要用户在聊天中确认本次包含的确切档案，而不是只保存一款产品。任何草稿变更都会清除完成标记。聊天文档通过当前会话拥有的附件引用读取，并返回分块引用。建档会话执行知识工具白名单，终端、文件系统及直接写企业档案的工具不能绕过确认。

首次进入时创建一个自定义名称的企业或工作室。档案包含标识、简介、产品或服务、网站和联系方式。资料页支持多文件上传、类型筛选、名称搜索、图片及视频预览、下载、重命名和确认删除。企业标识从已上传图片中选择；删除该图片时也会清空档案标识。支持的文档进入本地文本索引，只有通过工具请求的片段才进入模型上下文。

支持 JPEG、PNG、WebP、GIF、AVIF、MP4、WebM、QuickTime、PDF、DOCX、XLSX、PPTX、ZIP 和 UTF-8 编码的 TXT/CSV/Markdown。二进制格式根据内容识别；客户端提供的 MIME 类型不能放行不支持的格式。文档以附件形式下载。视频播放取决于浏览器的编解码支持。文件逐个上传；批次中后续文件失败时，之前成功的文件仍然保留。

### 随附业务 Skills

同一个企业插件注册这些业务方法；每个 Skill 复用相同记录和工具，不会各自创建插件：

- [产品 GEO](skills/product-geo/SKILL.md)通过有来源的聊天审阅建立企业和产品记录。
- [海外买家研究](skills/overseas-buyer-research/SKILL.md)寻找并判断有证据支持的买家机会。
- [供应商评估](skills/supplier-evaluation/SKILL.md)比较代发和贴牌供货选择及待核实缺口。
- [产品利润评估](skills/product-profitability/SKILL.md)计算落地成本、费用、退货、情景和测试阈值。
- [小品牌定位](skills/brand-positioning/SKILL.md)把业务事实整理为聚焦的定位假设和市场测试。
- [询盘回复](skills/inquiry-response/SKILL.md)提取买家需求并准备经核查的回复或报价框架，不自动发送。

### 海外买家机会

随插件提供的[海外买家研究 Skill](skills/overseas-buyer-research/SKILL.md)规定 Agent 如何确定目标、寻找候选、核查当前来源、统一评估匹配程度并说明不确定信息。`enterprise_opportunity_list` 用于避免重复研究，`enterprise_opportunity_save` 负责校验并保存新增或修订记录。Skill 指令不能绕过插件校验，也不能授权对外联系。

**机会看板**展示已保存买家、目标产品、国家、匹配分数、证据数量、阶段和下一步。用户可以搜索、筛选、查看引用的网页证据、调整阶段、归档记录或开始新的研究会话。记录使用乐观版本控制，过期的 Agent 或浏览器更新不能覆盖较新的内容。进入“已确认匹配”或后续阶段时，必须至少包含一条 HTTP(S) 证据；联系人和商业事实可以明确保持未知。

SQLite 的 `enterprise_opportunities` 表跨会话保存完整记录。当前闭环止于形成可继续跟进的持久机会，不会发送开发信息、核实非公开联系人数据，也不会宣称已经存在采购关系。

## 存储与配置

### Supplier Commerce Profile 与文档查询

在现有产品 GEO 对话中，让 Agent 根据企业文档建立采购档案。企业草稿支持结构化 `supplier` 图谱，包含产品供给、解决方案、能力、价值主张、案例、合作伙伴计划和商业政策。供给节点可以引用已确认的产品记录；图谱不替代产品库。声明保留适用条件、证据引用、不确定性及有效期。证据区分文档、用户陈述、网站和社交动态，并明确支持的声明和证明范围。Agent 输入不能赋予 `VERIFIED` 状态。

`enterprise_geo_draft` 校验图谱引用及引用的文档片段。`enterprise_geo_review` 展示完整图谱，取得用户确认。`enterprise_supplier_query` 返回当前已确认图谱，支持可选的 `query`、`kind`、`recordId`、`nodeId` 和 `offset`；`maxKnowledgeResults` 限制每页结果。修订草稿确认前，原版本仍可查询。`enterprise_search` 返回文档 `fileId` 和 `chunk`；`enterprise_document_read` 返回对应原文、引用标签、内容哈希及上传时间。已删除证据标记为缺失。工具输出沿用现有 Session 日志路径。

企业空间默认展示采购能力档案。**编辑采购档案**可维护每个对象、声明、证据和关系；**与 Agent 建档**通过现有对话提取草稿。供给层级涵盖品类、系列、产品和变体。适用买家、市场、合作模式和保密说明明确保存。证据卡可打开原文或已上传媒体，保留类别、可信度、摘录和发布时间。解决待确认问题，保存草稿，再审阅完整版本后确认。查询使用字面关键词，由调用 Agent 理解自然语言采购请求。扫描文档需要可提取文本；OCR 未启用。

**核对来源**和 `enterprise_supplier_verify` 对精确已确认版本记录独立人工核对凭据，不代表第三方认证。推断、冲突、过期或缺失来源会阻止该核对。**采购匹配**和 `enterprise_supplier_match` 使用等于、包含、最小值和最大值操作，对每个候选对象独立比较必选或可选属性。MATCH 要求覆盖全部必要属性的当前无条件证据及人工核对凭据；NO_MATCH 表示存在已确定的不符合项；POSSIBLE 保留缺失、带条件、过期或无法比较的事实。数值比较要求明确且兼容的单位。社交观察和媒体不能单独证明精确规格。

**采购请求**记录询价、打样、规格确认、合作申请和采购洽谈。工作区表单和 `enterprise_procurement_prepare` 保存草稿；用户确认提交后，可按已提交、跟进中、已关闭推进。外部买家 API 提交直接进入请求列表。请求绑定精确企业版本和所选对象，拒绝过期编辑，重启后保留，相同重试复用同一 UUID。这些操作不发送邮件、不创建付费订单、不付款。SQLite 保存披露版本、来源核对凭据、请求和审计记录。

### 外部采购 Agent API

外部读取使用独立的 Bearer 凭据及明确的部署授权。未配置 `externalAgentToken` 时，不注册 `/supplier/v1/` 路由。部署覆盖层读取 `DSH_SUPPLIER_AGENT_TOKEN`（至少 32 个字符）、`DSH_SUPPLIER_RECORDS`（精确 `{ "id": "<company-record-uuid>", "revision": 2 }` 授权的 JSON 数组）和 `DSH_SUPPLIER_DOCUMENTS`（已上传文件 UUID 的 JSON 数组）。通过 `enterprise_geo_status` 获取已确认档案的标识和版本，通过 `enterprise_search` 获取文件标识。配置授权但不配置密钥会导致配置校验失败。密钥存放在提交文件之外，配置后重启 `trade` profile。远程部署负责提供 HTTPS 和网络访问控制。

**外部 Agent 接入**选择已确认版本和文件；保存通过乐观版本检查立即替换授权范围。部署授权仅在首次保存工作区授权之前生效。所有接口均要求 `Authorization: Bearer <token>`，独立于浏览器登录。读取接口使用 GET；操作接口使用 JSON POST，请求体受 `maxSupplierBodyBytes` 限制（默认 1 MiB）。响应设置 `Cache-Control: no-store`，路由禁止索引。

| 路由 | 结果 |
| --- | --- |
| `/supplier/v1/manifest` | 版本、认证方式、读取接口和操作 JSON 输入 schema。 |
| `/supplier/v1/query?query=viscose&kind=capability` | 已授权且确认的图谱对象、声明和证据；筛选条件均可选。使用 `recordId` 和 `offset` 获取指定档案的下一页，或使用 `nodeId` 沿关系查询。 |
| `/supplier/v1/search?query=viscose` | 仅检索明确授权文档中的匹配片段。 |
| `/supplier/v1/document?fileId=<uuid>&chunk=1` | 一个已授权片段及其引用标签和内容哈希。 |
| `/supplier/v1/asset?id=<uuid>` | 共享原始文件，包含媒体范围读取。 |
| POST `/supplier/v1/match` | 对每个对象比较结构化采购要求。 |
| POST `/supplier/v1/inquiries` | 幂等提交采购请求；只返回请求标识、版本和状态。 |

文件授权开放原始字节和全部索引片段。未授权文件无法检索或读取，其证据引用只返回证据标识和 `not_shared`，不能支持外部 MATCH。企业授权开放完整已审阅图谱和章节，包含案例和商业声明。确认替代版本后，原版本授权失效，需要重新核对来源并授权。移除授权或删除文件立即生效；密钥轮换需要重启。密钥只服务一个本地企业和一组共享范围，不提供独立买家身份、OAuth、MCP 传输或匿名供应商目录。

构建产物和匹配测试覆盖版本审阅、来源删除、不确定性、授权撤销、请求幂等及状态流转。`test/supplier-browser.test.mjs` 启动正式 `dsh` Web profile，在桌面和手机上验证编辑、审阅、原文读取、匹配、请求和实时共享，证据保存于 `.trade-runtime/supplier-evidence/`。无密钥的[供应商文档快照](../../snapshots/session/supplier-document-missing/snapshot.yml) 通过 headless profile 回放缺失来源的工具结果和后续 Agent 回复，并核对提示词和工具 schema。它使用编写的模型输出；真实模型端到端对话不属于这次验证。

### 结构化 GEO 产品

产品草稿支持可选的结构化 `product`，包含身份、直接回答、适用客户、类型化事实、证据、媒体、变体、解决方案关联及报价。事实值由 claims 唯一保存；报价引用商业事实，并指定币种、订购单位、地区和有效期。面料 GSM 别名统一为 `g/m²`，幅宽统一为厘米。未知商业信息保持未知。自由文本档案仍可读取，但不满足结构化产品就绪要求。

`enterprise_geo_status` 分别返回实体、理解、事实、证据和发现五层状态及阻断原因。普通草稿确认不代表产品事实已核验。`enterprise_geo_verify` 针对精确的已确认版本，单独取得用户核对来源后的声明；模型输入不能设置该凭据。来源缺失、公开事实为推断或冲突状态、计量无效、商业事实过期都会阻止预览。用户核验不代表独立认证，修订后需要重新核验。

认证后的 `GET /api/enterprise/products/readiness?id=<record-id>` 返回相同的就绪报告。`GET /api/enterprise/products/preview?id=<record-id>` 编译 HTML，添加 `&format=jsonld` 则返回一致的 JSON-LD。配置完成后提供公开的 `/products/<slug>`、`/robots.txt` 和 `/sitemap.xml` 路由。内部预览排除私有事实和证据，并使用 `no-store` 与 `noindex`；公开路由只包含当前有效且已发布的产品。Discovery 仍缺少多语言实体归一、自动监控，也不保证搜索收录。结构化产品建档的完整真实模型及录制会话测试仍未覆盖。

[部署覆盖层](../cordis.patch.yml) 提供绝对路径 `directory`、`maxFileBytes` 和 `maxTotalBytes`。当前限制为单文件 256 MiB、企业空间总容量 2 GiB。默认目录为 `.trade-runtime/enterprise/`，其中 `enterprise.sqlite` 保存记录，`files/` 下保存以 UUID 命名的私有文件。备份时先停止服务器，再复制整个目录。SQLite 的 `user_version` 单调递增；不支持的版本会在启动时失败。

经过认证的 `/api/enterprise` 路由提供档案和元数据，`/api/enterprise/file` 根据已校验的资料标识提供字节范围读取。显示名称不会用作磁盘路径。上传完成流式写入和类型校验后才提交数据库记录。启动时清理中断写入及无元数据归属的文件。被媒体读取锁定的已删除文件可能在下次启动时才从磁盘清理。

已确认且完成人工核验的产品可以通过 `enterprise_shopify_sync` 同步到 Shopify，部署配置提供 `shopDomain`、`accessToken` 和 `apiVersion`。同步保存 Shopify 产品和变体 ID，不发送价格和库存，并记录失败原因以便重试。公开产品位于 `/products/<slug>`，HTML 与 JSON-LD 使用同一份数据；`/robots.txt` 和 `/sitemap.xml` 只列出已成功同步的产品。

`GET /api/enterprise/shopify/jobs` 返回 `{items,total,limit,offset,hasMore}`；每个任务包含持久化的 `handle` 和 `attemptsLog`，失败且仍未达到配置的尝试次数上限时带有 `retryable`。接口支持 `productId`、`connectionId`、`status`、`limit` 和 `offset` 筛选。

用户自己的 Shopify 店铺使用 `/api/enterprise/shopify/oauth/start` 和 `/api/enterprise/shopify/oauth/callback`。回调会校验 state 和 HMAC，使用 code 换取 offline token，并将加密 token 与租户本地店铺连接一起保存。`POST /api/enterprise/shopify/webhooks` 校验原始 body 的 HMAC，按 `X-Shopify-Webhook-Id` 去重，并在店铺卸载应用时将连接标记为撤销。

`enterprise_site_publish` 和 `enterprise_site_unpublish` 独立控制 Shopify-GEO 公开站点，不依赖商业同步。站点发布会分配唯一 slug、内容指纹、版本、公开 URL 和时间戳。只有 `siteStatus: published` 的产品进入公开路由和 Sitemap；等待 Shopify 商业店铺连接不会阻止站点投影。

每个本地部署只有一个企业，工作区访问由现有浏览器登录控制，外部采购读取由上述独立授权控制。此插件不实现多账户成员体系、租户隔离、匿名文档共享或文件转换。数据结构和 Host（宿主）负责记录一致性；插件没有独立的运行时不变量安装器。

## Canonical Company Entity

档案保存的是 Workbuddy Company Entity 的兼容投影，而不只是展示文本。首次提交时生成稳定的 `companyEntityId`（`cmp_...`）；`identity`、`offerings`、`fit`、`capabilities`、`constraints` 和 `trust` 是唯一事实源。旧版 `name`、`business` 等字段继续保留，作为编辑器的兼容字段。

事实可携带 `status`（`VERIFIED`、`SELF_DECLARED`、`INFERRED`、`UNKNOWN`、`OUTDATED`、`CONFLICTED`）、`visibility`（`PUBLIC`、`AGENT`、`WORKSPACE`、`RESTRICTED`）、来源、更新时间和有效期。公开输出不得把内部字段当作公开事实。

机器读取接口：

- `/api/enterprise/public`：输出公开 Company Entity 投影。
- `/api/enterprise/agent`：输出公开字段及允许 Agent 使用的 capabilities 和 constraints。

两个接口都从同一份 SQLite 企业记录生成，不维护第二套 JSON 或网页数据源。接口尚未替代认证的工作区接口；公开发布时仍需由上层 Web 路由配置缓存、canonical URL、robots 和 JSON-LD。

## Sites workspace

Sites 侧栏无需企业档案或 Shopify 店铺即可打开持久化网站列表。界面支持对话创建和修改、桌面/手机私有预览、源文件编辑、源码导出和历史草稿恢复。`site_create`、`site_get`、`site_update_draft`、`site_preview` 和 `site_rollback` 使用经过认证的部署身份；文件编辑拒绝过期的预期版本。Host 将源码项目存入 `sites.sqlite`，独立于创建它的会话。源文件只能包含获准公开的内容。

静态预览将已保存的本地脚本、模块导入、样式和图片打包到无法访问编辑器 DOM 的沙箱中，不在企业 Host 执行项目代码。保存源码或打开本地预览不会发布网站。

可选 Vercel 托管为每个站点创建受保护项目。在提交文件之外设置 `DSH_SITES_VERCEL_TOKEN` 和 `DSH_SITES_VERCEL_TEAM_ID`，然后重启 trade profile。`siteHosting` 配置控制请求超时、响应和上传字节上限，以及恢复查询的分页限制。配置要求同时提供两项凭据；凭据只留在 Host，不进入源码上传或浏览器响应。提供方要求部署地址启用 Vercel 身份验证，并在上传源码前关闭正式域名自动分配。预览访问者使用其 Vercel 团队账号。

Sites 面板构建选定版本、显示构建状态并打开受保护的云端预览。静态 HTML 只从虚拟文件编译，与浏览器资源一起上传到静态输出目录；生成的包脚本不会执行。Next.js 源码在 Vercel 构建，生成的 `vercel.json` 或 `.vercel/` 设置会被拒绝。人工检查云端构建后，必须确认其明确版本和源码摘要才能请求发布。提供方提升或回滚这个现有正式构建，不重新构建当前草稿。云端接受请求后仍保持待确认状态，直到刷新状态核实正式路由。`site-hosting.sqlite` 将部署和待确认操作与源码版本分开保存。丢失的提交响应按已保存的请求标识和摘要查询恢复；未确认的项目创建需要先到 Vercel 核实再重试。

云端构建、版本提升、恢复和请求拒绝具有本地提供方协议测试。真实 Vercel 发布仍需使用实际账号验证。本部署尚未提供自定义域名、下线、Workspace 访问受众与协作者管理、应用密钥及持久应用数据。现有 Shopify-GEO 发布仍是独立的商品投影。

`pnpm exec vitest run --config trade/enterprise/vitest.sites.config.ts` 验证托管持久化和提供方协议。`node --test trade/enterprise/test/sites-browser.test.mjs` 使用隔离 home 启动构建后的 `trade` profile，验证源码预览、编辑、恢复，以及使用模拟云端响应的明确版本发布审核，并将桌面与手机截图写入 `.trade-runtime/sites-evidence/`。模型驱动建站和正式部署仍需额外的记录会话及真实提供方验证。

## 企业云电脑

侧栏的**企业云电脑**为已有 Grokbot 工位提供独立 HTTP 凭据、明确的任务资料授权、企业成果文件和人工验收。配置步骤、连接器请求、取消语义及供应商限制见[云电脑参考](computers.zh.md)。

## 开发验证

[开发辅助脚本](../dev.ps1) 在根目录 pnpm 安装后，使用本插件的 npm 锁文件安装依赖，并在上游应用构建后构建插件。Host 和浏览器产物均通过 `trade` dsh profile（运行配置）加载。

完成上游构建及本插件依赖安装后，在仓库根目录执行：

```powershell
node trade/enterprise/build.mjs
node node_modules/typescript/bin/tsc -p trade/enterprise/tsconfig.host.json
node node_modules/typescript/bin/tsc -p trade/enterprise/tsconfig.client.json
node --test trade/enterprise/test/storage.test.mjs
node --test trade/enterprise/test/browser.test.mjs
```

存储测试在私有临时目录中，用真实 Connection 注册表挂载构建后的插件。浏览器测试在系统分配的端口启动真实 dsh profile，并隔离企业存储；Windows 需要 Edge，其他平台需要 Playwright Chromium。测试覆盖档案创建、图片及视频渲染、重命名、刷新、删除和响应式布局。截图写入 Git 忽略的 `.trade-runtime/enterprise-evidence/` 目录。这些测试不需要模型密钥。
