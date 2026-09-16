# Trade Workspace foundation

English | [中文](README.zh.md)

This development deployment uses the upstream Web UI and agent loop. [upstream.json](upstream.json) pins the source baseline; [cordis.patch.yml](cordis.patch.yml) is the deployment extension layer. No replacement chat UI or agent framework is installed.

## Run on Windows

Use Node 22.19+ or 24+ and the repository's pinned pnpm version. The helper also discovers the Codex bundled tools when normal commands are unavailable.

```powershell
.\trade\dev.cmd -Action Install
.\trade\dev.cmd -Action Build
.\trade\dev.cmd -Action Check
.\trade\dev.cmd -Action Start
```

Open <http://127.0.0.1:3080>. Set a different local port with `-Port 3081`. Configure a model provider and API key in the native settings UI. A successful page load does not verify a real model request. The command wrapper permits this PowerShell script for its own process without changing the machine execution policy.

The helper runs the published `dsh` CLI entry with a `trade` profile copied from the shipped `web` template. It keeps credentials and sessions in `.trade-runtime/`, and starts in `.trade-workspace/`. Both directories are ignored by Git. Existing profile files are preserved. `Check` prints the composed configuration and may initialize a missing profile; it does not start the server. Stop the foreground server with Ctrl+C.

## Deployment limits

This is a local single-user development foundation. The separate data directory is not tenant isolation. Organization accounts, resource authorization, isolated execution, RAGFlow and long-term memory are not connected. Keep the server on loopback while those features are absent.

## Enterprise workspace

Open **Enterprise workspace** in the sidebar. The first visit creates a user-named company or studio; the profile and asset tabs share one local enterprise. Images, videos and company documents are stored independently of chat Sessions. See the [enterprise plugin reference](enterprise/README.md) for supported formats, limits, storage and verification.

Retain upstream components unless a verified requirement needs replacement. Business extensions belong under `trade/` or dedicated plugins. Review the upstream commit and config changes before updating the baseline. The Git checkout has shallow history; retrieve the remaining history before historical comparisons. No hosted fork or remote business repository is created by this setup.
