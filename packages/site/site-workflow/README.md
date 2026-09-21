---
description: "Retrying and idempotent publication workflow for structured sites."
kind: "package-reference"
---

# @deepseek-ai/dsh-site-workflow

English | [中文](README.zh.md)

## Summary

`SitePublishWorkflow` resolves a tenant-owned site and Shopify connection, renders a controlled revision payload, publishes it with a stable idempotency key, records each attempt, retries bounded failures, and emits audit events.

The workflow supplies its Shopify side effect to `SiteService.runPublishJob`, so the Site service commits `running`, `succeeded` or `failed` before the result is returned. A successful provider call therefore advances `publishedRevisionId`; a retry exhaustion leaves the previous publication unchanged.

## Publication configuration

Publication accepts only a queued job whose site and revision match the supplied operation; mismatches fail before any provider call.

Options require an explicit `themeId`. The workflow verifies the revision against stored state, resolves the tenant-owned connection, and refuses a missing or already-live selected theme. Only `ShopifyApiError` values classified as transient or rate-limit are retried. Permission errors and unknown failures stop immediately. Audit callback failures propagate without repeating a successful provider publication. Attempt status persists with the Site job. Rich audit callback records remain process-local and are returned detached.

## Known Limitations and Deferred Work

- The controlled renderer produces Shopify theme templates and rejects arbitrary source projects. Live publication requires an authorized provider and approved content.
- The enterprise worker owns durable destination review and automatic queue draining. Distributed locks and automatic rollback remain deployment responsibilities.

## Model Experience

No direct model-facing tool.

#### KV Cache effect

None.
