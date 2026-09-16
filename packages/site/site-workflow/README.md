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

Options require an explicit `themeId` and HTTP(S) `publicOrigin`. The workflow verifies the revision against stored state, resolves the tenant-owned connection, and refuses a missing selected theme. Only `ShopifyApiError` values classified as transient or rate-limit are retried. Permission errors and unknown failures stop immediately. Audit callback failures propagate without repeating a successful provider publication. Attempt history is process-local and returned as detached records.

## Known Limitations and Deferred Work

- The current renderer produces static HTML, robots, sitemap and a JSON revision artifact. These files are not a Shopify theme; a production adapter must translate approved content into Shopify theme templates before live publication.
- Durable attempt storage, distributed locks and automatic rollback remain deployment responsibilities.

## Model Experience

No direct model-facing tool.

#### KV Cache effect

None.
