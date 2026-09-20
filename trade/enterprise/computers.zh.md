---
description: "将 Grokbot 电脑绑定到本地企业任务、授权文件和人工验收流程。"
kind: "package-reference"
---

# 企业云电脑

[English](computers.md) | 中文

## 概要

侧栏的**企业云电脑**将已有 Grokbot 账号作为外部执行人员管理。企业 Host 拥有任务、固定上下文包、文件授权、审批和验收；Grokbot 在原生电脑中执行。绑定账号不会创建云电脑，也不证明已获得电脑访问权。每个部署只服务一家企业，使用现有共享浏览器登录，不是具备租户隔离的托管服务。

## 目录

- [连接工位](#connect-a-workstation)
- [执行方 HTTP 连接器](#worker-http-connector)
- [验收与恢复](#acceptance-and-recovery)
- [存储与验证](#storage-and-verification)

<a id="connect-a-workstation"></a>
## 连接工位

1. 启动 [trade 配置](../README.zh.md#在-windows-上运行)，打开**企业云电脑**。填写工位名称、独立供应商账号标识、岗位名称、原生 HTTPS 地址及职责。地址不能带凭据、查询参数或片段。账号标识由用户填写，不代表供应商账号已经验证。
2. 将仅显示一次的连接凭据保存到授权工位的凭据存储。这是企业连接器凭据，不是 Grokbot Gateway Token 或 Admin API Key。Host 只保存 SHA-256 摘要。**轮换连接凭据**使旧凭据失效，也可以重新连接已断开的工位。不要将凭据放入任务上下文、提示词、上传文件或截图。
3. 选择**分配工作**，填写目标、带版本的上下文与未知信息，选择必要的企业文件，每行填写一项必需成果。提交即授权工位读取所选完整文件。每次分配都会创建关联的企业任务。外部工位只能读取明确授权的文件，不会自动获得完整企业档案和知识库。
4. 配置执行方调用下面的 HTTP 连接器，并在原生 Grokbot 中启动。远程工位需要运维人员为 `/computer/v1/` 配置 HTTPS 访问，其他本地部署接口保持私有。本机回环地址无法被托管云电脑访问。领取任务前先调用 `manifest` 验证连通性。
5. 在 Workspace 打开上传成果并验收。登录、验证码及其他人工操作通过原生电脑完成。

同一供应商账号下的 Bot 可能共享文件和凭据。不同安全域必须使用独立供应商账号，包括跨部署的情况。Host 会拒绝本部署中的重复账号标识，但无法识别账号别名或证明供应商隔离。岗位说明和连接器审批无法限制已登录网站中的操作，应通过供应商及源系统权限落实限制。

<a id="worker-http-connector"></a>
## 执行方 HTTP 连接器

这是部署自有的 HTTP API，不是 Grokbot API，也不是 MCP 地址。每个请求携带 `Authorization: Bearer <连接凭据>`。服务端从凭据确定绑定身份，执行方不能自行指定其他工位或 Workspace。带浏览器 Origin 的请求被拒绝。响应使用 `Cache-Control: no-store`，不返回供应商凭据。`maxComputerBodyBytes` 配置 JSON 请求限制；文件上传复用企业文件配额及格式验证。

| 方法与路径 | 行为 |
|---|---|
| `GET /computer/v1/manifest` | 返回绑定身份、操作说明，以及明确标记为未验证的供应商能力。 |
| `POST /computer/v1/claim` | 返回 `{job,resumed}`。Null 表示没有任务。重复领取返回同一项未完成工作，不代表可以重新执行动作。 |
| `GET /computer/v1/job?id=<job-id>` | 返回已分配任务及当前审批（如有）。 |
| `GET /computer/v1/file?jobId=<job-id>&id=<file-id>` | 在执行中、等待人工或审批时读取明确授权的输入文件。 |
| `POST /computer/v1/report` | 接收下述 JSON 回报，并检查乐观并发版本。 |
| `POST /computer/v1/artifact?jobId=<job-id>&revision=<observed-revision>&output=0` | 为从零开始编号的必需成果上传原始文件字节。`X-File-Name` 携带百分号编码的显示文件名。返回包含新文件凭据及 SHA-256 的任务。 |

回报正文包含 `id`、`expectedRevision`、`action` 和 `message`。`action` 可以是 `progress`、`request_approval`、`submit_result`、`confirm_stop` 或 `fail`；`progress` 还可以设置 `waitingHuman: true`。使用每次操作返回的新版本；发生冲突后先读取任务，再判断能否继续。外部副作用不明确时，不要重新执行整个任务。

```json
{"id":"<claimed-job-id>","expectedRevision":2,"action":"progress","message":"Public research is underway."}
```

执行方读取已领取任务中的 `instructions`、`context`、`contextVersion`、`inputFileIds` 和 `expectedOutputs`，并在外部动作之前及安全检查点读取任务状态。`request_approval` 必须说明确切的拟执行动作，它会创建普通企业任务审批。Workspace 通过现有审批服务批准或拒绝。只有审批通过且审批任务未被修改时才能继续。被拒绝后可以回报失败，不能继续执行；审批也不会增加文件授权。

按成果编号逐项上传必需文件，再通过 `submit_result` 提交总结及未解决问题。上传响应丢失后应先读取 `job.artifacts` 核对，不能盲目重复上传。并发取消或撤销访问可能导致文件上传后无法关联到任务，此时文件保留在企业文件库，供检查和删除。连接器不会下载执行方提供的 URL，也不会打开执行方提供的 Host 路径。

<a id="acceptance-and-recovery"></a>
## 验收与恢复

提交结果进入 `VERIFYING`，不会直接成功。平台在提交及通过验收前检查每项必需成果都有实际存在的文件。人工检查格式、内容和证据后选择成功、部分完成或失败。只有通过验收才把关联企业任务标记为完成。哈希证明字节一致性，不证明事实正确；模块没有自动验证具体业务内容。

每个工位同时只执行一个已领取且未终结的任务。领取没有会过期的执行租约，失联不会自动重新排队。重复领取返回 `resumed: true`，执行方必须核对已有活动，不能重新开始。**标记待核实**记录 `UNKNOWN` 并阻止后续任务，等待检查。刷新浏览器或重启 Host 会保留持久化状态，但不表示电脑仍然在线。

未领取任务可以在本地取消。已领取任务的**请求停止**只记录 `CANCEL_REQUESTED`；只有认证执行方停止后回报 `confirm_stop`，才记录 `CANCELLED`。这是执行方确认，不是经过独立验证的供应商停止。迟到的进展或完成回报不能覆盖待停止状态。**断开连接**撤销凭据、取消未领取任务，并将其他未终结任务设为 `UNKNOWN`，不会停止远程电脑。请检查原生 Grokbot，必要时轮换凭据重新连接、请求取消，并取得执行方停止确认。

本模块尚未实现 Grokbot 自动唤醒、供应商 Admin API 配置、MCP 安装、桌面画面嵌入、同一电脑的多个岗位，以及 DSH 模型自主委派。`taskPush`、`remoteStop` 和 `embeddedDesktop` 均保持 `UNVERIFIED`。[已有 Grokbot 队列](../../packages/webhook/webhook-grokbot/README.zh.md) 是独立模块，本模块不会挂载它。

<a id="storage-and-verification"></a>
## 存储与验证

企业 SQLite schema 版本 13 增加电脑记录及凭据摘要。关联任务、审批、文件元数据和审计事件复用已有存储。创建和状态变更使用事务；任务 UUID 是幂等键，同一键提交不同内容会被拒绝。不需要修改 Harness loop 或 Session 格式。文件授权引用不可变素材 ID，删除后无法继续访问。备份时停止 Host，并保存整个企业目录。

使用 `node trade/enterprise/build.mjs` 构建。从仓库根目录运行 `node node_modules/vitest/vitest.mjs run --config trade/enterprise/vitest.sites.config.ts trade/enterprise/test/computer-store.spec.ts` 验证状态与授权，运行 `node --test trade/enterprise/test/computer-browser.test.mjs` 验证构建后的 `dsh` 配置、HTTP 连接器和桌面/手机浏览器流程。浏览器证据位于 `.trade-runtime/computer-evidence/`。测试模拟外部执行方，不证明真实 Grokbot 已连通，也不包含模型 Session 录制回放。
