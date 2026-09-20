# 企业空间插件

[English](README.md) | 中文

这个私有部署插件通过原生侧栏和主面板 Slot（插槽）提供**企业空间**。它复用 Harness 的认证、语言词典、React 基础组件及浏览器模块加载器。SQLite 保存本地记录；`file-type`、Zod 和 `range-parser` 分别提供文件识别、输入校验和媒体范围读取。

配置 [Commerce 连接](../commerce/README.zh.md#run-locally)后，“继续产品商业化”传输已映射的企业/产品事实及来源版本，并在本面板内挂载共用 Commerce 控件。用户保留原地址与登录状态；已认证的 Host 路由仅向 Commerce 转发允许的业务操作。文件、Shopify 连接和企业记录仍保留在这里。刷新失败或冲突时，可选择仅打开已保存的 Commerce 资料，不更新来源。“进入品牌新品测试”在同一面板中选择明确绑定的品牌身份。返回企业记录不刷新应用。其店铺选择通过凭证保护的类型化接口复用本 Host；Shopify Token 保留在这里。仅配置品牌连接后，重新授权店铺才申请发布渠道权限。

## 用户记录

### 工作台概览

已有企业档案时，企业空间默认打开**工作台**，根据已保存记录显示摘要和下一步操作。四项统计涵盖已确认企业及产品记录、已上传资料、排除已成交和已流失记录的活跃机会，以及尚未完成的活跃任务。**企业展示**、企业档案、资料、机会、任务和 **Assistant** 保留为独立视图。空状态引导用户进入相应设置或创建操作。概览不展示示例业务结果，也不根据记录数量推断营收和增长。

**Assistant** 中的建档向导通过卡片展示已保存的建档进度，并按用户请求继续原会话。网站提供静态创建指南和建站控件。已连接电脑优先呈现保存的设备与任务，演示默认折叠，连接管理按需打开。这些面板采用相同的工作台呈现方式。[工作台导航与业务状态](../../.agents/notes/implemented/feature/2026-09-21-trade-workspace-product-design.zh.md)记录呈现决策及其限制。

工作台标签支持左右方向键及 Home/End，焦点随选中标签移动；Tab 键离开标签列表。可交互卡片区分悬停、按下和键盘焦点。内容切换使用短过渡，加载和保存反馈跟随实际请求。网站标明选中站点、预览或代码视图，以及桌面或手机预览尺寸。云电脑仅在主动刷新时显示刷新反馈，后台轮询不会重复播放。连接菜单支持 Escape、外部点击、Tab 及选择后关闭；菜单展开时暂停后台轮询，关闭后恢复。系统的减少动态效果偏好会关闭这些动画与过渡，同时保留选中状态和操作反馈。

### 对话建档

首次进入尚未建立企业档案的项目时，**企业空间**内置的 **Assistant** 自动展示业务、来源、草稿审阅及范围确认四项进度，并准备名为**企业初始化 · 档案建档**的固定会话。只有点击**开始建档对话**才发送原生 `/product-geo` 调用，加载随插件提供的 [skill](skills/product-geo/SKILL.md)。没有资料时先询问企业名称、主营业务和服务对象，每次最多三个问题；有资料时读取已有答案。提问和档案章节随实际业务组织。已有档案的项目从企业空间内的 **Assistant** 按钮或标签进入建档，也可使用 AI 创作。侧栏只保留企业空间入口。

本地部署的 SQLite `enterprise_geo` 表保存企业和产品草稿、来源、待回答问题、版本和调用会话标识。聊天确认服务收到用户回答后才确认；过期确认不能提交已修改内容。仅在企业基础档案不存在时，确认操作创建基础档案。GEO 章节保持私有，不进入现有机器读取投影。此本地部署不提供租户隔离，确认也不代表商业认证或公开发布。

构建产物测试验证并发请求及重启后的单一会话绑定、原生 skill 加载、草稿持久化和确认。浏览器测试验证首次引导、刷新续聊及不重复发送初始指令。[空项目建档回放](../../snapshots/session/enterprise-onboarding-empty/snapshot.yml)使用预编写模型响应，验证引导指令、skill 注入、空档案读取和提问的会话持久化；它不证明真实模型完成多轮建档。

**继续建档对话**在刷新后重新打开同一会话。服务端持久化其标识；原生会话尚不存在时使用该标识创建，已有绑定保持不变。其他业务入口不复用建档会话。已确认档案可以建立独立修订草稿，原内容不会丢失。完成建档需要用户在聊天中确认本次包含的确切档案，而不是只保存一款产品。任何草稿变更都会清除完成标记。聊天文档通过当前会话拥有的附件引用读取，并返回分块引用。建档会话执行知识工具白名单，终端、文件系统及直接写企业档案的工具不能绕过确认。

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

企业展示标签页提供可阅读的业务概览。卡片展示产品供给、解决方案、能力和案例；选择卡片后打开条件、关联内容和来源。**与 Agent 建档**通过对话更新档案。**管理与操作**包含采购操作及**逐项维护**，每次编辑一个对象或来源。未保存修改需要明确选择是否放弃。草稿提示及已确认版本切换标明当前显示的版本。供给层级涵盖品类、系列、产品和变体。适用买家、市场、合作模式和保密说明明确保存。证据卡可打开原文或已上传媒体，保留类别、可信度、摘录和发布时间。解决待确认问题，保存草稿，再审阅完整版本后确认。查询使用字面关键词，由调用 Agent 理解自然语言采购请求。扫描文档需要可提取文本；OCR 未启用。

**核对来源**和 `enterprise_supplier_verify` 对精确已确认版本记录独立人工核对凭据，不代表第三方认证。推断、冲突、过期或缺失来源会阻止该核对。**采购匹配**和 `enterprise_supplier_match` 使用等于、包含、最小值和最大值操作，对每个候选对象独立比较必选或可选属性。MATCH 要求覆盖全部必要属性的当前无条件证据及人工核对凭据；NO_MATCH 表示存在已确定的不符合项；POSSIBLE 保留缺失、带条件、过期或无法比较的事实。数值比较要求明确且兼容的单位。社交观察和媒体不能单独证明精确规格。

**采购请求**记录询价、打样、规格确认、合作申请和采购洽谈。工作区表单和 `enterprise_procurement_prepare` 保存草稿；用户确认提交后，可按已提交、跟进中、已关闭推进。外部买家 API 提交直接进入请求列表。请求绑定精确企业版本和所选对象，拒绝过期编辑，重启后保留，相同重试复用同一 UUID。这些操作不发送邮件、不创建付费订单、不付款。SQLite 保存披露版本、来源核对凭据、请求和审计记录。

档案使用大幅企业主视觉，以图片为主呈现产品、案例与能力。每项显示名称和一句简短说明，详情保留条件与证据，次要业务内容折叠展示。空图片区域说明需要的照片，并打开上传及选择对话框。可选的 `profile.media` 持久化主视觉及图谱节点配图，与声明、来源核验及外部授权独立。服务端只接受已存在的图片素材。移除展示关联保留文件；删除文件会清除对应关联。明确关联的图片证据仍可用作对象的备用配图。浅色、深色及手机布局均保留这些交互。

**调整展示**将可选的 `supplier.presentation` 随企业版本保存，包含主标题、简介、产品／服务／项目导向、最多三个有序首页栏目和最多十四个主推对象 ID。自动组织依据结构化产品供给、服务模式及案例，不生成业务事实或图片。主推条目在所属栏目中优先显示。其他条目仍可搜索，并通过动态分类导航访问。明确选中的空栏目显示补充提示。切换导向会重置栏目顺序；恢复自动组织会移除人工展示覆盖。Agent 草稿接受同一套校验字段，并要求人工确认完整版本。产品、服务与项目布局保留共用视觉规范及已有配图。

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

**企业资料与自托管发布：**[企业 Sites 参考](sites/README.zh.md)说明已检查的档案和产品导入、当前端口上的固定版本发布、服务器部署要求和私有询盘收件箱。该流程不需要 Vercel 或 Shopify 店铺。

欢迎页用连续动画介绍对话修改、桌面/手机预览、源码与资源管理、草稿恢复和检查后发布。播放与章节控件只操作示例画面；减少动态效果偏好会停用动画与自动推进。托管和域名画面明确标注配置要求。

Sites 侧栏无需企业档案或 Shopify 店铺即可打开持久化网站列表。界面支持对话创建和修改、桌面/手机私有预览、源文件编辑、源码导出和历史草稿恢复。`site_create`、`site_get`、`site_update_draft`、`site_preview` 和 `site_rollback` 使用经过认证的部署身份；文件编辑拒绝过期的预期版本。Host 将源码项目存入 `sites.sqlite`，独立于创建它的会话。源文件只能包含获准公开的内容。

**从制造业模板开始**在选择品牌名称及稳重工业、精密科技、国际简约三种布局之一后，创建英文工业网站。Agent 先调用 `site_templates`，再向 `site_create` 传入返回的明确 `template.id`、`template.version` 和 `template.parameters`。参数支持品牌、标语、风格及具有唯一 slug 的可选产品目录。产品文本经过转义，自定义目录决定产品详情页和询盘选项。内置企业内容和工业图片仍为示意；询盘表单只准备未发送的本地草稿。发布前应替换示例并配置真实联系渠道。

静态预览将已保存的本地脚本、模块导入、样式和图片打包到无法访问编辑器 DOM 的沙箱中，不在企业 Host 执行项目代码。保存源码或打开本地预览不会发布网站。

模板版本和解析后的输入随源码保存在 `site.template.json`。`site_template_update` 接受完整替换参数和观察到的当前版本，保留固定的提供方版本并保存新草稿。源码修改会阻止重新生成；应继续编辑源码或另建站点。[模板服务](../../packages/site/site/README.zh.md#template-providers) 负责提供方注册和修改检测。模板创建在检查完整请求大小后原子保存站点和首个版本，无需调用模型 API。浏览器测试覆盖三种风格的桌面和手机布局，Host 测试覆盖重新生成、过期修改、源码修改拒绝和重启持久化。

对于 Next.js 源码，`site_preview` 向已配置的独立托管提交选定版本，并报告部署标识、摘要和构建状态。重复请求只查询同一构建，不会重新提交或发布。只有就绪的构建返回受保护预览地址。失败的构建保持失败，直到 Agent 保存修正后的版本；未确认的提交保留恢复检查点。预览查询不要求 DNS 或正式路由可用。

失败的云端构建为 Sites 面板和工具结果保留错误摘要及可选的构建日志末尾（`error`、`buildLog`）。Vercel 适配器先检查部署归属，再读取[部署事件](https://vercel.com/docs/rest-api/deployments/get-deployment-events)，移除终端转义序列并遮盖托管控制令牌。`siteHosting.maxBuildLogEvents` 限制获取的事件数；`siteHosting.maxDiagnosticCharacters` 限制摘要和日志文本的总长度。日志可能不完整。日志不可用不会抹去已确认的失败状态，后续刷新会重试读取日志，不重新提交源码。

源码编辑器可将选定的本地资源导入指定项目目录。文件在点击**保存新版本**之前不会保存；替换已有跨平台路径的文件必须勾选替换选项。浏览器按照 Host 请求大小限制检查完整编码后的版本，Host 在持久化前验证路径和文件字节。源码导出下载包含当前编辑器文件的标准 ZIP，包括未保存的修改。预览和云端构建使用选定的已保存版本。在 Sites 面板切换站点、修改选定版本、刷新列表或发起另一段对话之前，需要保存或放弃修改。

可选 Vercel 托管为每个站点创建受保护项目。在提交文件之外设置 `DSH_SITES_VERCEL_TOKEN` 和 `DSH_SITES_VERCEL_TEAM_ID`，然后重启 trade profile。`siteHosting` 配置控制请求超时、响应和上传字节上限，以及恢复查询的分页限制。配置要求同时提供两项凭据；凭据只留在 Host，不进入源码上传或浏览器响应。提供方要求部署地址启用 Vercel 身份验证，并在上传源码前关闭正式域名自动分配。预览访问者使用其 Vercel 团队账号。

Sites 面板构建选定版本、显示构建状态并打开受保护的云端预览。静态 HTML 只从虚拟文件编译，与浏览器资源一起上传到静态输出目录；生成的包脚本不会执行。Next.js 源码在 Vercel 构建，生成的 `vercel.json` 或 `.vercel/` 设置会被拒绝。人工检查云端构建后，必须确认其明确版本和源码摘要才能请求发布。提供方提升或回滚这个现有正式构建，不重新构建当前草稿。云端接受请求后仍保持待确认状态，直到刷新状态核实正式路由。`site-hosting.sqlite` 将部署和待确认操作与源码版本分开保存。丢失的提交响应按已保存的请求标识和摘要查询恢复；未确认的项目创建需要先到 Vercel 核实再重试。

下线会暂停 Vercel 项目；恢复上线继续使用原有正式构建。两项操作均要求确认观察到的线上部署，并保持待确认状态，直到查询提供方确认可用状态。网站下线时仍保留构建历史和源码版本。

自定义域名界面支持向站点托管项目添加、验证和移除域名。添加和移除确认绑定观察到的托管记录版本；并发修改后必须刷新。面板分别显示 Vercel 返回的所有权验证记录和路由记录。DNS 修改由域名所有者完成。平台域名只读，提供方不会从其他项目转移域名。`siteHosting.maxDomains` 限制域名查询数量。尚未确认的外部操作保留持久检查点，供刷新状态时核实。

云端构建、版本提升、可用状态、域名操作和恢复具有本地提供方协议测试。真实 Vercel 发布、DNS 生效及 TLS 就绪仍需使用实际账号验证。本部署尚未提供 Workspace 访问受众与协作者管理、应用密钥及持久应用数据。现有 Shopify-GEO 发布仍是独立的商品投影。

`pnpm exec vitest run --config trade/enterprise/vitest.sites.config.ts` 验证托管持久化和提供方协议。`node --test trade/enterprise/test/sites-browser.test.mjs` 使用隔离 home 启动构建后的 `trade` profile，验证源码预览、编辑、恢复，以及使用模拟云端响应的明确版本发布审核。自然品牌、深色科技和杂志编辑风格的夹具验证桌面与手机布局、图片、延迟脚本交互和页面导航；每次运行将截图写入独立的 `.trade-runtime/sites-evidence-*` 目录。脚本化的[缺失预览 Session](../../snapshots/session/site-preview-missing/snapshot.yml) 和[缺失背景图 Session](../../snapshots/session/site-preview-missing-background/snapshot.yml) 通过真实 profile 回放工具拒绝结果。这些场景不证明真实模型生成能力。

构建仓库和本插件后，`node --test trade/enterprise/test/sites-model.e2e.mjs` 请求真实模型创建三种不同风格的静态网站。测试在每个 CLI 进程退出后检查持久源码，再验证浏览器交互和响应式布局。在环境变量或根 `.env` 中配置 `DEEPSEEK_API_KEY`；缺少密钥时，三个场景均跳过。该测试不发布网站。真实 Vercel 部署、DNS 和 TLS 仍需配置托管并审阅明确构建。插件构建遇到无法解析的导入时会失败；构建前应在 `trade/enterprise` 中执行 `npm ci --workspaces=false --ignore-scripts` 安装独立依赖。

使用兼容网关时，`DSH_SITES_MODEL` 指定 DeepSeek 模型 ID。`DSH_SITES_MODEL_PATCH` 可指定其他提供方的绝对路径 profile 覆盖文件，`DSH_SITES_API_KEY_ENV` 则选择其凭据变量，替代 `DEEPSEEK_API_KEY`。每个真实调用场景将生成的项目、编译后 HTML 和通过验证的桌面/手机截图写入独立的 `.trade-runtime/sites-live-*` 目录。成功读取模型列表不能证明流式响应或工具调用兼容，仍须完成完整生成测试。

## 企业云电脑

侧栏的**企业云电脑**为已有 Grokbot 工位提供独立 HTTP 凭据、明确的任务资料授权、企业成果文件和人工验收。主动回连的 Python 连接器提供认证在线状态，以及可选的 X11 截图控制台和鼠标键盘输入。配置步骤、连接器请求、取消语义及供应商限制见[云电脑参考](computers.md)。

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
