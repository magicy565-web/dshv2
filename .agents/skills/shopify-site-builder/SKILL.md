---
name: shopify-site-builder
description: Build, modify, preview, test, and publish Shopify storefronts through a tenant-safe structured AI workflow. Use for Shopify themes, products, collections, SEO content, OAuth connections, webhooks, and controlled publication.
metadata:
  short-description: Build and publish Shopify sites safely
---

# Shopify Site Builder

Use this skill for end-to-end Shopify site work. Treat every request as a structured site change, never as permission to paste arbitrary Liquid, JavaScript, or raw API calls into a store.

## Workflow

1. Resolve public-store or user-owned OAuth mode, tenant, connection, API version, and minimum scopes.
2. Read the current site revision, theme capabilities, catalog, brand settings, and publication history.
3. Convert natural language into a typed `SiteChangeSet` containing controlled pages, copy, SEO, theme tokens, product bindings, and ordering.
4. Validate paths, IDs, theme fields, code allowlists, tenant bindings, and the base revision before provider calls.
5. Render a preview and diff. Keep the draft revision separate from the published revision and require confirmation before production publication unless approval is already recorded.
6. Create a `PublishJob` with a stable idempotency key. Resolve the store again, render approved templates, retry only transient failures, and record every attempt.
7. On success record mappings, version, timestamp, and audit event. On failure preserve the draft and prior published revision. Rollback publishes a selected historical revision as a new revision.
8. Verify desktop/mobile preview, links, availability, SEO metadata, accessibility basics, and absence of unapproved Liquid/JavaScript.

## Shopify requirements

- Use the current Admin GraphQL API version selected in configuration. Admin requests carry `X-Shopify-Access-Token`; request only required access scopes.
- OAuth authorization-code flow must validate redirect URI, state, shop domain, and HMAC before exchanging the code for an offline token. Encrypt tokens at rest and handle denied, expired, revoked, reinstalled, and uninstalled states.
- Verify webhook HMAC before parsing, deduplicate with `X-Shopify-Webhook-Id`, and protect newer local projections from out-of-order deliveries.
- Prefer Shopify CLI and Theme Check for theme development. Publish only approved template files and settings; arbitrary scripts, checkout/payment changes, and unapproved Liquid require a separate capability.
- Never expose raw Shopify IDs or public-store internals to ordinary tenants. Filter both persistence queries and service methods by tenant.
- Use branded IDs and explicit `resolve(request): Spec`; never silently fall back from OAuth to public mode.
- Record model-visible inputs, drafts, confirmations, publication states, and errors in Session so recovery is reconstructable.
- Keep real public-store payments disabled until tax, refund, consumer-rights, inventory, settlement, and dispute owners approve them.

## References

- Read [references/shopify-official.md](references/shopify-official.md) for official Shopify facts and URLs.
- Read [references/site-model.md](references/site-model.md) for revision and change-set rules.
- Read [references/acceptance.md](references/acceptance.md) before claiming publication complete.
