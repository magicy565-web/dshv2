# Agent Note: Shopify Site and Agentive Shopping completion plan

Status: proposed

## Problem

The repository has Shopify, Site, publication workflow, Cart, OAuth, and Agentive Shopping contracts, but lacks a durable application path from authorization through tenant-scoped site editing, publication, shopping, order support, and Web UI operation.

## Proposal

Complete the capability in ordered layers. First add HTTP-owned OAuth routes, encrypted offline tokens, connection health, reinstall/revoke/uninstall handling, real Admin GraphQL and Storefront API providers, market-aware catalog and Cart operations, authenticated webhook receipt, deduplication, ordering protection, and bounded retries.

Next persist `Tenant`, `Site`, `StoreConnection`, `ProductBinding`, `SiteRevision`, `PublishJob`, `PublishAttempt`, and `AuditEvent`. Enforce tenant filtering in storage and services. Add revision locks, idempotency, restart recovery, immutable revisions, preview diffs, controlled theme rendering, rollback, and provider mappings.

Then implement Agentive Shopping offer snapshots, market pricing, inventory freshness, explicit purchase confirmation, checkout handoff, Customer Account authorization, order status, cancellation, refund, return, fulfillment, dispute, and human-support paths. Publish a versioned authenticated channel manifest with actions, markets, scopes, rate limits, consent, retention, staging, revocation, and a kill switch.

Add the `apps/web` Site workspace for connections, AI editing, product binding, preview, diff, publishing, shopping recommendations, Cart confirmation, checkout handoff, and order support. Render from persisted projections and locale-owned dictionaries.

Add public-store attribution, platform fees, settlement batches, operations review, audit search, quotas, monitoring, data deletion, and security review. Keep real public-store payment disabled until tax, payment, refund, consumer-rights, inventory, settlement, and dispute approvals are recorded.

## Alternatives considered

**Build the Web UI before durable services.** Rejected because UI state would become a second source of truth and would not support restart recovery or auditable publication.

**Use Admin API for shopper carts.** Rejected because buyer Cart and checkout belong to Storefront API; Admin operations remain merchant-authorized.

**Treat API success as production readiness.** Rejected because payment, tax, refund, privacy, order ownership, and settlement require non-technical approval.

## Acceptance criteria

- A development store completes OAuth, catalog sync, market-aware Cart creation, explicit confirmation, checkout handoff, webhook processing, and order-status lookup.
- Two tenants cannot read or mutate each other's connections, sites, products, carts, revisions, jobs, or orders.
- Restart restores drafts, approvals, publication attempts, Cart state, and order projections from durable data and Session events.
- Concurrent publication is rejected or coalesced; retries are bounded; timeouts cannot duplicate orders or publications.
- Failed publication leaves the draft and previous published revision unchanged; rollback creates a new immutable revision.
- Web UI passes desktop/mobile workflow tests and keyless Session replay.
- Evaluation covers stale offers, market differences, Cart expiry, duplicate delivery, malicious catalog text, unauthorized operations, and revoked channels.
- Public-store payment remains disabled until the compliance decision is recorded.

## Risks

Shopify API versions, scopes, Cart fields, checkout behavior, webhook topics, and Agent channel protocols can change. Pin versions and scopes in provider configuration, recheck official documentation before release, and run integration tests against a development store or `mock.shop`.
