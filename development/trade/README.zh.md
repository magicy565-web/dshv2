# 外贸 Workspace 底座

[English](README.md) | 中文

此开发部署复用上游 WebUI 和 agent loop（智能体循环）。[upstream.json](upstream.json) 固定源码基线；[cordis.patch.yml](cordis.patch.yml) 是部署扩展层。项目未安装替代聊天界面或另一套 Agent 框架。

## 在 Windows 上运行

使用 Node 22.19+ 或 24+，以及仓库指定版本的 pnpm。常规命令不可用时，辅助脚本也会查找 Codex 附带的工具。

```powershell
.\trade\dev.cmd -Action Install
.\trade\dev.cmd -Action Build
.\trade\dev.cmd -Action Check
.\trade\dev.cmd -Action Start
```

打开 <http://127.0.0.1:3080>。使用 `-Port 3081` 指定其他本地端口。在原生设置界面中配置模型提供方和 API 密钥。页面成功加载不代表真实模型请求已经验证。命令包装器只允许自身进程执行此 PowerShell 脚本，不改变系统执行策略。

辅助脚本调用已发布的 `dsh` CLI（命令行界面）入口，使用从内置 `web` 模板复制的 `trade` profile（运行配置）。凭证和会话保存在 `.trade-runtime/`，启动目录为 `.trade-workspace/`。这两个目录均被 Git 忽略。已有 profile 文件会保留。`Check` 输出组合后的配置，并可能初始化缺失的 profile；它不启动服务器。使用 Ctrl+C 停止前台服务器。

## 部署限制

这是本地单用户开发底座。独立数据目录不等于租户隔离。组织账户、资源授权、隔离执行环境、RAGFlow 和长期记忆尚未接入。在具备这些能力前，服务器保持监听本机回环地址。

## 企业空间

打开侧栏中的**企业空间**。首次进入时创建自定义名称的企业或工作室；企业档案和企业资料两个标签页共用一个本地企业。图片、视频和企业文档独立于聊天会话保存。支持格式、容量限制、存储位置及验证方法见[企业插件参考](enterprise/README.zh.md)。

除非已验证的需求需要替换，否则保留上游组件。业务扩展放在 `trade/` 或专用插件中。更新基线前审查上游提交及配置变化。Git 工作副本目前使用浅历史；进行历史比较前需补齐其余记录。此设置不会创建托管 Fork 或远程业务仓库。
