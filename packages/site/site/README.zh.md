---
description: "AI Shopify 站点的结构化版本和发布接口。"
kind: "package-reference"
---

# @deepseek-ai/dsh-site

[English](README.md) | 中文

## Summary

本包负责租户范围内的站点、版本、结构化变更集和发布任务。Agent 只产生 `SiteChangeSet`，由 `validateSiteChangeSet` 校验后再交给 Provider 转换为 Shopify 资源。

## Publication lifecycle

内存提供方将任务排队与执行分开。同一版本重复排队或运行中的请求复用任务；一个站点只允许一个正在运行的发布。排队任务可以取消。执行要求配置发布提供方，且只有提供方完成后才记录成功。失败保留先前的 `publishedRevisionId`；发布期间的编辑保留独立的 `currentRevisionId`。

版本输入和返回记录与存储状态相互独立。回滚创建新版本而不覆盖历史。版本和发布历史按插入顺序倒序排列，同一毫秒创建的记录也遵循此顺序。

局部编辑将当前草稿记录为基础版本。`content` 解析继承的页面、主题和商品顺序；显式空数组清空对应集合。`diff` 比较完整内容中的页面新增、删除、编辑和顺序变化。`preview` 渲染所选存储页面而不发布。回滚存储目标版本的完整内容，并停止继承被替换草稿的内容。这些读取拒绝其他租户或站点所属的版本。

## Editor HTTP

经过身份验证的编辑接口对未知路由和不存在的页面返回 404，对不支持的方法返回 405，对缺失的预览参数或无效变更集返回 400。路由和方法检查先于操作参数与请求体解析。预览页面查找使用解析后的版本内容，包含继承的页面；显式空页面列表会从该版本中移除这些页面。响应为私有内容并使用 `no-store`。

`POST /sites/:id/publish` 将现有版本加入发布队列并返回 `202`；可选的 `expectedRevisionId` 会在编辑器状态过期时返回 `409`。入队不会直接执行提供方，重试和外部副作用由发布工作器负责。

## Snapshot files

显式 `save` 写入私有临时文件、同步内容，再重命名以替换目标。父目录必须存在。`load` 在替换运行状态前检查记录字段、重复 ID、版本引用和站点归属。发布运行期间拒绝恢复；恢复的运行中任务变为失败，重试前必须核对提供方状态。排队任务保持排队。快照包含服务持有的所有租户，只能放在管理员控制的存储中。

## Automatic SQLite persistence

`./sqlite` 入口导出 `SqliteSiteStateStore`；将其传给 `./memory` 的 `InMemorySiteService` 构造函数第三个参数。每次修改都在可见前提交。启动恢复存储状态，并将中断的运行中任务标记为失败。提交失败恢复先前内存状态；运行状态提交失败时不会调用发布方。SQLite 使用单调递增的 `user_version` 并拒绝不支持的版本。代次检查拒绝过期写入者，避免覆盖另一连接的状态。关闭数据库前须先停止服务工作。

## Known Limitations and Deferred Work

- 文件快照保存是显式操作；可选 SQLite 适配器提供自动提交。每个事务保存完整服务快照，适用于每个数据库一个活跃服务，不提供分布式发布。Session 事件和 UI 投影尚未实现。
- 内存发布回调不提供生产审批流程或 Shopify 部署适配器。仅渲染 HTML、robots 和 sitemap 不会发布 Shopify 主题。
- 首版校验只支持受控模板字段，不接受任意 Liquid 或 JavaScript。

## Model Experience

本包提供站点编辑工具将使用的类型数据，但当前不注册面向模型的工具。

#### KV Cache effect

无。
