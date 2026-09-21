---
description: "在企业服务器部署官网和开源配套服务。"
kind: "package-reference"
---

# 部署企业官网

[English](README.md) | 中文

## 摘要

此部署包将现有 dsh profile 与 Caddy、Umami/PostgreSQL、Ollama、SearXNG、ntfy 及可选 EspoCRM/MariaDB 组合，无需付费服务或商业扩展。管理员需要提供 Linux 服务器、带 Compose 的 Docker Engine、两个 DNS 名称及足够的模型内存。容器启动、公网 DNS/TLS、备份恢复和真实模型质量需要在该服务器验收，尚未在 Windows 开发主机验证。

## 目录

- [初始化](#initialize)
- [连接服务](#connect-services)
- [验收发布](#verify-publication)
- [备份与企业隔离](#back-up-and-isolate-enterprises)

## 初始化 {#initialize}

1. 将源码放到服务器并进入本目录，把两个 DNS 名称指向服务器并放行 HTTP/HTTPS。管理端口只绑定回环地址，初始化不会覆盖已有私有配置。

```sh
node init.mjs www.company.example metrics.company.example
docker compose --env-file private/deployment.env config --quiet
docker compose --env-file private/deployment.env up -d --build
docker compose --env-file private/deployment.env exec ollama ollama pull qwen3:8b
```

2. 仅允许管理员访问 `private/`，其中包含数据库密码、备份凭据和服务配置。应用通过 `dsh --profile trade` 启动。默认 [Qwen3 8B 模型](https://ollama.com/library/qwen3:8b)使用 Apache-2.0 许可；需要时修改 `SITE_MODEL` 并下载其他开源模型。支持 CPU 推理；GPU 配置遵循 [Ollama 指南](https://docs.ollama.com/docker)。正式上线前，使用 [compose.yml](compose.yml) 中的覆盖变量固定已验收镜像摘要。

3. 打开管理用 SSH 隧道，从 `docker compose --env-file private/deployment.env logs app` 读取已认证工作空间地址，并私密保管令牌。替换下方 SSH 目标。

```sh
ssh -L 3080:127.0.0.1:3080 -L 3081:127.0.0.1:3081 -L 3082:127.0.0.1:3082 -L 3083:127.0.0.1:3083 operator@server
```

## 连接服务 {#connect-services}

4. 通过隧道的 3081 端口打开 Umami，修改初始管理员密码并创建[自托管 API 密钥](https://docs.umami.is/docs/api/authentication)。将下方 `umami` 对象加入 `private/site-services.json`，保留 `search`，并替换域名和密钥。公开统计域名只提供追踪脚本和采集接口，报表保持私有。

```json
{
  "search": { "baseUrl": "http://searxng:8080/" },
  "umami": {
    "baseUrl": "http://umami:3000/",
    "publicUrl": "https://metrics.company.example/",
    "dashboardUrl": "http://localhost:3081/",
    "apiKey": "YOUR_PRIVATE_UMAMI_KEY"
  }
}
```

5. 如需通知，运行 `docker compose --env-file private/deployment.env exec ntfy ntfy user add --role=admin site-owner`，再运行 `docker compose --env-file private/deployment.env exec ntfy ntfy token add site-owner`。添加 `notifications: {baseUrl, topic, token}`，使用 `http://ntfy/` 和专用主题。通过隧道打开 ntfy 网页订阅，匿名访问默认拒绝。独立发布者与订阅者账号遵循 [ntfy 访问控制](https://docs.ntfy.sh/config/#access-control)。

6. 如需 CRM，运行 `docker compose --env-file private/deployment.env --profile crm up -d`。通过隧道打开 3083 端口，使用生成的 `CRM_ADMIN_PASSWORD`。创建有 Lead 读取/创建权限的 EspoCRM API 用户；添加 `crm: {baseUrl, apiKey}`，地址使用 `http://espocrm/`。集成使用标准 Lead REST 操作，无需付费 Advanced Pack。详见 [EspoCRM API 权限](https://docs.espocrm.com/development/api/)。

7. 配置变化后重启：`docker compose --env-file private/deployment.env restart app`。在 Sites 读取网站配置，勾选自动连接 Umami 和产品咨询，检查公开内容后保存草稿。通知、CRM 和定期搜索检查在运营设置中单独启用；未配置服务的开关保持禁用。

## 验收发布 {#verify-publication}

8. 检查并发布保存的版本。复制包含 `/sites-live/<site-id>/` 的完整公开地址，运行验收脚本。`--consult` 会实际调用模型、记录 Session 并消耗咨询配额；省略该选项只检查页面。向客户提供服务前，检查实际回答和术语质量。

```sh
node verify.mjs https://www.company.example/sites-live/00000000-0000-4000-8000-000000000001/ --consult
```

9. 不携带工作空间凭据访问网站，提交有标记的测试询盘，核对收件回执、Umami 事件和已启用的 ntfy/CRM 回执。验收后删除测试记录及外部副本。搜索故障必须显示为不完整或失败；零匹配不能单独证明未收录。反向代理拒绝管理路径。如需使用域名首页，在 `Caddyfile` 的网站块加入到已发布目录的根路径重定向，再重新加载 Caddy。

## 备份与企业隔离 {#back-up-and-isolate-enterprises}

在本目录运行 `sh backup.sh`。脚本停止正在运行的写入服务，用开源 restic 备份应用、统计、CRM、通知及配置数据，检查完整性，并在结束或失败后恢复同一组服务。将加密的 `backups/` 备份库复制到服务器之外，单独保管 `private/restic-password`。模型文件可重新下载，因此不包含在备份中。备份期间需要维护窗口。

使用 restic 在恢复主机的新空目录中还原，不能覆盖运行中的数据库。保留原数据库镜像版本，恢复对应数据卷内容与配置，在切换 DNS 前重复公开验收。操作遵循 [restic 恢复指南](https://restic.readthedocs.io/en/stable/050_restore.html)。完成恢复演练后，备份才算通过运营验收。

每个企业使用独立安装目录、私有配置目录、Compose 项目和数据卷。不同信任域使用独立主机；共用服务器时需要不同的回环端口及管理员维护的前置代理。工作空间保留单企业授权方式，此部署包不引入共享多租户账号。服务凭据必须属于对应企业。
