# Agent Note: Commerce business records and runtime separation

Status: implemented

English | [中文](2026-09-21-commerce-business-runtime-separation.zh.md)

## Problem

Small brands need sourced product recommendations and low-risk launch tests. A conversation log or a buyer-research opportunity cannot own canonical supply facts, merchant constraints, samples, store approvals and commercial outcomes.

## Decision

The independent [Commerce Workspace](../../../../trade/commerce/README.md) owns fifteen business entities in SQLite. Shared React controls run inside the original Enterprise workspace and through a standalone Next.js entry. Only its Runtime Provider imports the official pinned Harness SDK. The AgentGateway treats model output as untrusted draft proposals; service authorization prevents model-originated confirmation, disclosure and publication. Readiness and recommendations depend on current fact evidence and exact source revisions.

The [local enterprise workspace](2026-09-14-local-enterprise-workspace.md) and [trade foundation](../process/2026-09-14-trade-workspace-foundation.md) retain their existing deployment ownership. Their persistence and profile-composition decisions remain useful; this addition does not replace their files, database or native UI. The separate product's merchant matching excludes public marketplaces, sales-agent claims and CRM pipelines.

An authenticated enterprise continuation connects the existing entry to Commerce. A deployment credential binds one factory and an optional merchant. Native controls use the existing enterprise login and a closed server dispatch API, retaining business authorization without sending the deployment credential to the browser. Standalone access uses expiring single-use handoffs. Source import receipts retain identity and revision; unchanged imports preserve confirmation, source updates revoke imported evidence, and conflicting local values refuse the complete refresh. Source review does not grant commercial confirmation or disclosure. Separate ownership therefore permits reuse through a validated API without copying the enterprise database or treating Session data as business truth. The existing SDK home supplies runtime configuration, while the official pinned SDK owns its subprocess. Browser projection types stay independent of database and runtime implementations; shared CSS is scoped to the Commerce component to preserve the host UI.

Shopify drafts use stable launch handles and verify product ownership. The enterprise Host owns and resolves Shopify credentials through closed operations, checking store status, merchant identity and scopes on every request. The first draft attempt pins the store and publication; later selections cannot redirect existing launches. Publication binds a human approval to exact source, launch and listing revisions. A persistent execution checkpoint prevents concurrent publication; uncertain results require inspection rather than replay. Source edits are refused while publication needs reconciliation. Frozen launch supply cost supports retrospective product-cost-only margin estimates.

## Alternatives considered

**Store commerce in Sessions or fork the loop.** Runtime replacement would couple business data to a provider, and authorization would depend on model behavior.

**Reuse the existing buyer opportunity as ProductOpportunity.** Buyer research describes demand, while the new object packages a supplier product for a merchant test. Sharing one state machine would mix unrelated facts.

**Publish directly after draft generation.** Draft preparation does not authorize an external store change. An approval must identify the version the merchant reviewed.

## Consequences

Keyless source-import tests cover the transition from existing facts through confirmation to opportunity, plus duplicate import, removal, conflicts, handoff replay, expiry and credential rebinding. Browser verification covers embedded entry, native navigation and returning without changing the origin. Isolated tests cover server-only dispatch, closed routes, cancellation, source-role separation, merchant continuation, encrypted store reuse, destination pinning, revocation and schema migration. Model diagnostics require an actual response; local SDK initialization succeeds, but inference fails without model credentials. Live extraction and store publication still require usable accounts, as described in the workspace README.

Focused tests cover a synthetic twenty-product scenario, persisted outcomes, tenant-role refusal, source revocation, invalid transitions, retries, provider wire payloads and uncertain publication recovery. They do not prove real factory verification, model extraction or Shopify publication. The [plan](../../../../trade/commerce/PLAN.md) names remaining self-service OAuth, ingestion, creative generation, analytics and LLM matching gaps. Local credentials are deployment bindings, not a complete production identity system.
