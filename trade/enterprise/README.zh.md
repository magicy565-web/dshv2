# 企业空间插件

[English](README.md) | 中文

这个私有部署插件通过原生侧栏和主面板 Slot（插槽）提供**企业空间**。它复用 Harness 的认证、语言词典、React 基础组件及浏览器模块加载器。SQLite 保存本地记录；`file-type`、Zod 和 `range-parser` 分别提供文件识别、输入校验和媒体范围读取。

## 用户记录

### 对话建档

企业档案尚未建立时，企业空间只提供**开始产品 GEO**。按钮打开新会话并发送原生 `/product-geo` 调用，加载随插件提供的 [skill](skills/product-geo/SKILL.md)。固定顺序为检查已有记录、了解业务、收集来源、完善草稿和在聊天内请求确认。问题与档案章节根据用户业务生成，不使用行业表单。已有企业档案保留**产品 GEO**入口。

本地部署的 SQLite `enterprise_geo` 表保存企业和产品草稿、来源、待回答问题、版本和调用会话标识。聊天确认服务收到用户回答后才确认；过期确认不能提交已修改内容。仅在企业基础档案不存在时，确认操作创建基础档案。GEO 章节保持私有，不进入现有机器读取投影。此本地部署不提供租户隔离，确认也不代表商业认证或公开发布。

构建产物测试验证原生 skill 加载、草稿持久化、拒绝及过期确认和动态字段。浏览器测试验证单按钮入口与聊天跳转；这些测试不能证明真实模型完成多轮建档或录制会话回放。

**继续建档**在浏览器刷新后重新打开已保存的会话；会话不可用时才创建新会话，并由 skill 读取保存的进度。已确认档案可以建立独立修订草稿，原内容不会丢失。完成建档需要用户在聊天中确认本次包含的确切档案，而不是只保存一款产品。任何草稿变更都会清除完成标记。聊天文档通过当前会话拥有的附件引用读取，并返回分块引用。建档会话执行知识工具白名单，终端、文件系统及直接写企业档案的工具不能绕过确认。

首次进入时创建一个自定义名称的企业或工作室。档案包含标识、简介、产品或服务、网站和联系方式。资料页支持多文件上传、类型筛选、名称搜索、图片及视频预览、下载、重命名和确认删除。企业标识从已上传图片中选择；删除该图片时也会清空档案标识。文件不会发送给模型，也不会加入知识索引。

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

每个本地部署只有一个企业，访问由现有浏览器登录控制。此插件不实现多账户成员体系、租户隔离、公开分享、文件转换或知识入库。数据结构和 Host（宿主）负责记录一致性；插件没有独立的运行时不变量安装器。

## Canonical Company Entity

档案保存的是 Workbuddy Company Entity 的兼容投影，而不只是展示文本。首次提交时生成稳定的 `companyEntityId`（`cmp_...`）；`identity`、`offerings`、`fit`、`capabilities`、`constraints` 和 `trust` 是唯一事实源。旧版 `name`、`business` 等字段继续保留，作为编辑器的兼容字段。

事实可携带 `status`（`VERIFIED`、`SELF_DECLARED`、`INFERRED`、`UNKNOWN`、`OUTDATED`、`CONFLICTED`）、`visibility`（`PUBLIC`、`AGENT`、`WORKSPACE`、`RESTRICTED`）、来源、更新时间和有效期。公开输出不得把内部字段当作公开事实。

机器读取接口：

- `/api/enterprise/public`：输出公开 Company Entity 投影。
- `/api/enterprise/agent`：输出公开字段及允许 Agent 使用的 capabilities 和 constraints。

两个接口都从同一份 SQLite 企业记录生成，不维护第二套 JSON 或网页数据源。接口尚未替代认证的工作区接口；公开发布时仍需由上层 Web 路由配置缓存、canonical URL、robots 和 JSON-LD。

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
