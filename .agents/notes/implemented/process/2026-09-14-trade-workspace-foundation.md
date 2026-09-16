# Agent Note: Trade Workspace development foundation

Status: implemented

English | [中文](2026-09-14-trade-workspace-foundation.zh.md)

## Problem

The trade workspace needs a maintained agent runtime and browser application with a small upstream maintenance burden.

## Decision

The checkout retains the upstream source and uses a separate `trade` profile derived from `web`. The [development helper](../../../../trade/dev.ps1) invokes the built upstream CLI, supplies the [deployment patch](../../../../trade/cordis.patch.yml), and separates development sessions and credentials from the user's normal Harness home. It starts in a dedicated business directory and binds only to loopback. The [source record](../../../../trade/upstream.json) identifies the baseline and the shallow-history limitation.

## Alternatives considered

**Replace the frontend immediately with assistant-ui.** The native UI already provides the conversations, files and workspace controls needed to validate the foundation. Replacement adds protocol adaptation before a demonstrated product requirement.

**Add a second agent loop and memory stack immediately.** Harness already owns sessions, tools and execution. Additional services are deferred until their business ownership and integration requirements are known.

## Consequences

The extension adds no runtime framework dependency and changes no upstream agent behavior. The deployment is a local single-user foundation; separate directories do not provide tenant isolation. Organization accounts, business persistence and retrieval remain subsequent implementation work. A hosted fork requires a destination repository and is not created by the local helper.
