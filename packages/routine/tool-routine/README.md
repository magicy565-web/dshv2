---
description: "Model-facing Routine creation, listing, deletion, and immediate-run tools."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-routine

English | [中文](README.zh.md)

The plugin exposes four tools: `routine_create`, `routine_list`, `routine_delete`, and `routine_run_now`. A Routine starts a future independent Agent session; it is not a same-session reminder. Completion delivery uses the existing background-job notification path when the creating Agent remains live.
