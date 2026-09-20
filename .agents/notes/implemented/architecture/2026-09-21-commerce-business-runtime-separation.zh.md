# Agent Note: Commerce 业务记录与 Runtime 分离

Status: implemented

[English](2026-09-21-commerce-business-runtime-separation.md) | 中文

## Problem

小品牌需要有来源的产品推荐和低风险新品测试。对话日志或买家研究商机不能拥有统一供应事实、品牌约束、样品、店铺审批及商业结果。

## Decision

独立的 [Commerce Workspace](../../../../trade/commerce/README.zh.md) 通过 SQLite 保存十五种业务实体。共用 React 控件在原企业空间及独立 Next.js 入口中运行。只有 Runtime Provider 导入固定版本的官方 Harness SDK。AgentGateway 将模型输出视为不可信草稿建议；服务端授权阻止模型确认、披露及发布。Readiness 与推荐依赖当前事实证据和确切来源版本。

[本地企业工作区](2026-09-14-local-enterprise-workspace.zh.md)及 [Trade 基础部署](../process/2026-09-14-trade-workspace-foundation.zh.md) 继续拥有既有部署。它们的持久化和 profile 组合决策仍有价值；新增产品不替换其文件、数据库或原生界面。独立产品的 Merchant 匹配排除公开市场、销售代理认领及 CRM 流水线。

已认证的企业接续操作将原入口连接至 Commerce。部署凭证绑定一个工厂及可选品牌身份。原生控件使用现有企业登录及封闭服务器分发接口，保留业务授权，不向浏览器发送部署凭证。独立访问使用有有效期的一次性接续码。来源导入回执保留身份与版本；未变的导入保留确认，来源更新撤销导入证据，本地值冲突则拒绝整个刷新。来源审阅不授予商业确认或披露权限。独立所有权因此允许通过校验后的 API 复用资料，无须复制企业数据库或将 Session 作为业务事实。已有 SDK home 提供 Runtime 配置，固定版本官方 SDK 拥有其子进程。浏览器投影类型独立于数据库和 Runtime 实现；共用 CSS 限定于 Commerce 组件，保留宿主 UI 样式。

Shopify 草稿使用稳定 Launch handle 并校验商品归属。 企业 Host 通过封闭操作接口保管并解析 Shopify 凭证；每次调用检查店铺状态、身份和权限。首次草稿尝试固定店铺及发布渠道，后续店铺选择不改变已有 Launch 的目标。发布将人类审批绑定到确切来源、Launch 与 Listing 版本。持久化执行检查点阻止并发发布；不确定结果通过查询核实，不重复执行。等待发布核查时拒绝来源修改。冻结的供货成本支持事后仅扣产品成本的毛利估算。

## Alternatives considered

**把商业数据存入 Session 或 fork Agent Loop。** 替换 Runtime 会使业务数据与 Provider 耦合，授权也会依赖模型行为。

**把已有买家商机当作 ProductOpportunity。** 买家研究描述需求，新对象则为 Merchant 测试组织供应产品；共用状态机会混合无关事实。

**生成草稿后直接发布。** 准备草稿不授权外部店铺变更；审批必须指明 Merchant 审阅的版本。

## Consequences

无密钥来源导入测试覆盖从已有事实、确认到机会的链路，以及重复导入、移除、冲突、连接码重放、过期和凭证重新绑定。浏览器验证覆盖内嵌入口、原生导航及保持原地址的返回。服务器分发、封闭路由、取消、来源身份隔离、品牌接续、加密店铺复用、目标固定、授权撤销与版本迁移均有隔离测试。模型检测要求真实响应；本机 SDK 可初始化，但推理因缺少模型凭证未成功。真实提取和店铺发布仍需可用账号验证，详见工作台 README。

针对性测试覆盖合成二十产品场景、结果持久化、身份越权拒绝、来源撤销、非法状态、重试、Provider 请求及不确定发布恢复。它们不证明真实工厂核验、模型提取或 Shopify 发布。[方案](../../../../trade/commerce/PLAN.md) 明确自助 OAuth、材料导入、素材生成、分析和 LLM 匹配的剩余缺口。本地凭证是部署绑定，不是完整生产身份系统。
