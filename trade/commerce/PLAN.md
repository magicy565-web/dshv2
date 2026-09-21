# Agentive Commerce MVP: incremental architecture

English | [中文](PLAN.zh.md)

## Scope

The demand side serves existing small brands and independent retailers. Public marketplaces, Partners, Distributors, OpportunityClaims, CRM and Quote/Order pipelines are excluded. The loop is Factory → Passport → Opportunity → Merchant Profile → private matching → Sample → Launch → Shopify Draft → approved publication → Performance → STOP / ITERATE / SCALE.

## Existing module inventory

| Module | Existing capability | Treatment |
| --- | --- | --- |
| `trade/enterprise` | Company, GEO drafts, document extraction, evidence, SQLite | Existing entry transfers mapped facts and provenance through an authenticated API; files and store connections stay with their owner |
| `opportunities.ts` | Buyer research and follow-up | Not used as ProductOpportunity |
| `shopify*.ts` | OAuth, encryption, webhooks, product synchronization | Retained; new app uses configured stores and Admin GraphQL |
| `site-*.ts`, `computer-*.ts` | Websites and cloud computers | Not extended or required |
| `packages/sdk/client` | Official stdio JSON-RPC SDK | Runtime Provider only, pinned to `0.1.5-rc.2` |
| Harness Web UI | Existing plugin interface | Shared Commerce React controls mount in Enterprise workspace; Next.js remains a standalone entry and business API service |

## Data and API

The addition is `trade/commerce`, reusing Next.js, React, Zod, Node SQLite and the official SDK. `Product App → AgentGateway → AgentRuntime → DeepSeekRuntime` is separate from `Product App → CommerceService → commerce.sqlite`. Business code does not depend on Session formats; Core and the existing enterprise database remain independent.

Company, Product, ProductPassport, Evidence, ProductOpportunity, Merchant, MerchantBusinessProfile, OpportunityMatch, SampleRequest, ShopifyListing, Artifact, Launch, PerformanceSnapshot, Activity and Approval each have separate tables. Facts contain value, status, visibility and evidenceIds. Trust and disclosure are separate; UNKNOWN requires null; models cannot confirm facts. Opportunities, Listings and Artifacts reference Passport revisions. Source changes, revocation and expiry invalidate recommendations or approvals. Launches freeze observed supply cost.

| API | Behavior |
| --- | --- |
| GET `/api/workspace` | Factory- or Merchant-scoped business projection |
| GET `/api/manifest` | Version, command schema, READ / DRAFT / EXECUTE categories |
| GET `/api/products/readiness?id=…` | Missing fields for the owning factory |
| POST `/api/commands` | Schema, authorization, revisions, idempotency and atomic audit |
| POST `/mcp` | Authenticated supplier intake over Streamable HTTP; [connection and tool workflow](README.md#mcp-onboarding) |
| POST `/api/integration/open`, `/api/integration/resume`, `/api/integration/exchange` | Server-authenticated source refresh or saved-record access; exchange a single-use code for a scoped browser session |
| POST `/api/integration/dispatch` | Deployment-authenticated closed route forwarding for native enterprise controls; bound human roles, no arbitrary subject or URL |
| POST `/api/agent/check` | Send minimal inference; initialization or an empty response never counts as success |
| POST `/api/shopify/stores`, `/api/shopify/publications`, `/api/shopify/select` | Read existing stores and publications; human selection binds future launches |
| POST `/api/agent`, `/api/agent/apply` | Prepare proposals; apply drafts with Agent permissions |
| POST `/api/shopify/catalog`, `/api/shopify/draft` | Read the bound store's first 50 products/collections; write DRAFT |
| POST `/api/shopify/publish`, `/api/shopify/reconcile` | Execute exact-version approval; inspect uncertain results without writes |

Every business command carries requestId; updates carry expectedRevision. Identical retries return their stored result, while changed content under the same id conflicts. Server configuration determines identity; clients cannot choose roles. The external Plugin exposes create_company, ingest_company_source, create_product, update_product_fact, get_missing_fields and build_opportunity through the API only. Business requests require Bearer authentication; the handoff exchange requires a live single-use code. There is no public browsing endpoint.

## Pages and state machines

Factory: Home, Company, Products, Opportunities and sample responses. Merchant: Home, For You, Samples and Launches. Shared: Ask Workbuddy and Settings. Home shows business state; recommendations explain fit, terms, risks and UNKNOWN.

| Object | States |
| --- | --- |
| Readiness | DRAFT / DATA_INCOMPLETE / COMMERCIAL_INCOMPLETE / OPPORTUNITY_READY / PAUSED, computed in the backend |
| Opportunity | DRAFT → AVAILABLE ↔ PAUSED, requiring current eligible sources |
| Match | NONE → SAVED / NOT_INTERESTED; reasons persist and suppress the same product |
| Sample | REQUESTED → CONFIRMED → SHIPPED → DELIVERED → ACCEPTED; requests or deliveries can be REJECTED; Merchant can CANCELLED before shipping |
| Launch | PREPARING → READY → LIVE → SCALE / STOPPED; ITERATE records intent without changing status |
| Approval | PENDING → APPROVED / REJECTED; APPROVED → EXECUTING → EXECUTED / UNCERTAIN |
| Listing | PREPARED → DRAFT → PUBLISHED; draft synchronization has a separate operation state |

Launch PAUSED is reserved; no store pause command exists. STOP does not delist products. Uncertain publication blocks source edits; reconciliation never repeats publication.

## Migration order

Independent SQLite upgrades user_version transactionally, refuses unsupported higher versions and does not automatically migrate legacy enterprise data.

1. Company, Product, Passport, Evidence, Activity and idempotency receipts.
2. Opportunity, Merchant, BusinessProfile and Match.
3. Sample, Launch, Listing and Artifact.
4. PerformanceSnapshot and Approval.
5. Source import receipts and expiring hashed handoff/session credentials.
6. Session roles, current merchant store selections and pinned launch destinations; no Shopify tokens.
7. Immutable intake text sources and exact-version supplier submission receipts.

## E2E and gaps

Isolated tests verify 20 products, three with basic information and one eligible opportunity, followed by matching, sample acceptance, draft, approval, simulated publication, sales reporting, decision and reopen. Negative checks cover permissions, inference promotion, UNKNOWN, revoked evidence, stale revisions, wrong currency, illegal transitions, conflicting retries and uncertain publication. Provider wire tests verify Shopify request fields.

Real factory, model and Shopify acceptance remains incomplete. Matching uses transparent rules and explanations; Workbuddy can propose contextual advice, while persisted LLM matching analysis remains absent. Standalone Commerce self-service OAuth (existing enterprise authorization is reused), raw PDF/Web upload extraction, rendered graphics, automatic Shopify performance ingestion, catalog pagination and existing collection writes remain gaps. Each Launch currently generates two graphic briefs and eight text drafts; performance is source-labelled MERCHANT_REPORT with unavailable metrics kept null. This increment does not constitute complete commercial MVP acceptance.
