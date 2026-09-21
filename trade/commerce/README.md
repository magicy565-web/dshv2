# Commerce Workspace

English | [中文](README.zh.md)

## Summary

Prepare sourced factory products, privately match them to a small brand, accept samples, create Shopify drafts and approve test launches. Business records persist in independent SQLite. See the [scope, API, states and migrations](PLAN.md).

## Table of Contents

- [Run locally](#run-locally)
- [Connections](#connections)
- [MCP onboarding](#mcp-onboarding)
- [Verification and limits](#verification-and-limits)

<a id="run-locally"></a>
## Run locally

Use Node 24.13+ and pnpm from this independent workspace directory:

```sh
pnpm install
pnpm run setup:local
pnpm run build
pnpm start --port 3100
```

Open `http://127.0.0.1:3100`. Setup creates ignored `.env.local` and `data/local-access.json` with four distinct human/agent tokens; enter a human factory or merchant token on the login page. Setup refuses to overwrite existing configuration. It installs no synthetic business data. Never give a human token to an Agent.

Factory users create Company and Product drafts, review facts, authorize disclosure and prepare opportunities. Merchant users confirm their profile in Settings, run matching, request samples and accept a delivered sample before preparing a Launch.

To continue from the existing local enterprise, run `node scripts/connect-enterprise.mjs` in this directory after setup. Restart Commerce and the [trade deployment](../README.md). Open **Enterprise workspace → Continue product commercialization** on port 3080. The Host transfers the current catalog and mounts the shared business controls inside Enterprise workspace. Navigation remains on port 3080; the original sidebar and login stay available. Setup preserves matching existing bindings, adds an explicit merchant mapping, refuses conflicting identities and configures the pinned SDK's `sdk` profile using the existing `.trade-runtime` home. Choose **Continue brand launch tests** at the same entry for the bound merchant. **Return to enterprise workspace** closes the business panel without reloading the app. Model credentials still require configuration; **Settings → Check model connection** sends a minimal inference request and rejects empty responses.

The link imports mapped company fields and current GEO product facts as private, unconfirmed Commerce facts. Evidence and receipts retain original record ids, revisions, review timestamps and citations. It does not copy files, transfer Shopify credentials or replace enterprise records. Reopening refreshes the snapshot: unchanged sources preserve confirmations, changed sources invalidate imported evidence, and removed sources revoke it. Local value conflicts roll back the refresh; **Open saved commerce records without refreshing** retains access for review. There is no background synchronization or two-way writeback. Review sources before confirming commercial use.

<a id="connections"></a>
## Connections

The [server schema](src/server.ts) validates JSON `COMMERCE_CONFIG`: database, credentials, maxBodyBytes, matchLimit, shopify and optional runtime/enterprise/enterpriseStore. The enterprise binding fixes factoryId, optional merchantId, returnUrl, a server credential and ticket/session lifetimes. The [trade helper](../dev.ps1) reads ignored `.trade-runtime/commerce-link.json`, unless DSH_COMMERCE_LINK_SECRET_JSON is supplied. The embedded panel calls authenticated enterprise API routes; only the Host forwards the server credential to a closed Commerce dispatch API. The dispatch fixes subject ids from deployment bindings and applies ordinary business authorization and exact-version approval checks. Direct standalone handoffs remain single-use; token hashes expire or become invalid after a binding change. A Shopify entry binds merchantId to domain, accessToken, apiVersion, publicationId, timeoutMs and maxResponseBytes. This direct configuration remains available for deployments without an enterprise store bridge.

With enterpriseStore configured, **Settings → Load existing stores** reads the original Host's connections. A human selects a store and publication; Shopify tokens remain encrypted in the original owner. The closed `/commerce/v1/shopify` bridge accepts only its deployment credential and bound merchant, rejects browser origins, and resolves current connection status, scopes and credentials on every call. Managed tokens require an exact configured shop domain. A launch pins its store and publication before its first draft attempt, so changing the next store cannot redirect an approved launch. Existing remote products without a pin require operator review. Reauthorizing through the original OAuth entry requests product and publication scopes when the merchant bridge is configured; existing grants are not automatically expanded. Publication discovery follows Shopify's [2026-01 publications API](https://shopify.dev/docs/api/admin-graphql/2026-01/queries/publications) and shows the first 50 targets.

Set the enterprise timeoutMs above the Runtime requestTimeoutMs when using model operations; new local links use 150 seconds. Runtime configuration names an SDK-serving dsh profile, provider, model, dshHome, processCwd, requestTimeoutMs and maxTokens. Configure an extraction-only profile without shell/computer tools. The subprocess receives an explicit environment allowlist without business or Shopify credentials. The official SDK is pinned to `0.1.5-rc.2`; absent configuration produces `runtime_not_configured` without disabling ordinary business APIs. Merchant understanding reads the selected store catalog as untrusted source material and proposes drafts for review; it never confirms the profile automatically.

The [Plugin](plugins/commerce-workbuddy/.codex-plugin/plugin.json) uses COMMERCE_API_URL and COMMERCE_AGENT_TOKEN. Its [intake skill](plugins/commerce-workbuddy/skills/factory-intake/SKILL.md) reads materials through the host and calls the API. Plugin installation into Codex/Workbuddy is separate and has not been performed.

Shopify imports use DRAFT. Publication binds approval to exact Launch/Listing revisions. Uncertain publication requires read-only reconciliation and blocks source edits. Uncertain drafts retry using a stable launch handle; interruption while marked DRAFTING currently requires operator inspection. The adapter follows Shopify [productSet](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet) and [publishablePublish](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish); real-store verification remains pending.

<a id="mcp-onboarding"></a>
## MCP onboarding

Connect an external MCP client to `/mcp` to create sourced supplier company and product drafts. The client supplies its model, conversation and document reading; Commerce requires no model runtime for these tools. Records use this workspace's Company, ProductPassport and Evidence storage; they do not write back to the original Enterprise GEO records.

After starting Commerce, enter these connection values in Workbuddy's remote MCP settings. The endpoint is tested with the official MCP client; Workbuddy's current settings UI and authorization integration require client-side verification.

| Setting | Value |
| --- | --- |
| Transport | Streamable HTTP, JSON responses |
| Local URL | `http://127.0.0.1:3100/mcp` |
| Authorization header | `Bearer <factory-agent token>` from the private `data/local-access.json` |

Supply the credential through the client's connection settings, never conversation text. Each supplier needs its own `factory-agent` credential and `subjectId` in `COMMERCE_CONFIG.credentials`. Human and merchant credentials are rejected. These deployment bindings do not implement self-service registration or OAuth; changing them requires a server restart.

For remote use, terminate HTTPS at a trusted reverse proxy and add its external authority to `COMMERCE_CONFIG.mcp.allowedHosts`. The default allows only `localhost`, `127.0.0.1` and `[::1]`, with any port; an entry containing a port matches that authority exactly. `mcp.allowedOrigins` defaults to an empty array: requests carrying an Origin header are rejected unless that exact origin is allowed. The proxy must preserve the external Host, keep upstream access private, and enforce tenant request/storage quotas. Request bodies use `maxBodyBytes`. Each request authenticates independently; GET and DELETE return 405 because the endpoint retains no MCP sessions or standalone event stream.

Ask the client to read `trade_get_context`, then call `trade_start_onboarding`. Save extracted text with `trade_add_source`; cite its immutable id and exact excerpts in `trade_save_company` and `trade_save_products`. `trade_get_source` restores text after reconnecting. Local paths and URLs are provenance labels: the server never reads or fetches them. Binary upload, OCR and webpage extraction remain client responsibilities; split large documents into named text sources within the request limit.

Draft tools accept values and citations, not verification status or public visibility. Missing values stay null. `trade_get_missing_fields` distinguishes missing values from unverified facts. Product batches commit atomically. Reuse a `requestId` only for an identical retry, retain source/product ids, and supply observed revisions. Source text cannot be overwritten; corrected material uses a new source id. Source text and citations are client-supplied evidence, not independent verification.

`trade_submit_onboarding` saves the exact company and selected product revisions and returns a receipt plus the workspace URL. The company and selected products need sourced names; an empty product array explicitly submits only the company. Unknown optional commercial details do not block submission. Draft edits, new source material, stale selected revisions or revoked/expired name evidence make progress incomplete. Submission does not confirm facts, authorize disclosure or publish products. Human review remains in the workspace. The [MCP intake decision](../../.agents/notes/implemented/feature/2026-09-21-trade-mcp-intake.md) records ownership and recovery semantics.

<a id="verification-and-limits"></a>
## Verification and limits

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

The standalone Next.js entry and enterprise panel share React controls and scoped CSS. Browser projections contain only business types; the enterprise client does not import database or SDK implementations. The production typecheck covers the independent app, and tsconfig.tests.json checks cross-workspace tests through repository source mappings and vendor project references.

The synthetic scenario tests persistent business transitions and reopens SQLite after reporting revenue. Negative checks cover authorization, source validity, revisions, retries and approval recovery. Shopify tests inject a provider or wire transport; they create no real products, shipments or revenue.

`pnpm test` includes a scripted official MCP client, a recorded tool catalog and database-restart checks. After `pnpm run build`, `node --test test/mcp-built.test.mjs` exercises the compiled `/mcp` route on an operating-system-assigned port with a private database. It verifies persistence independently of tool responses and needs no model credentials. From the repository root, `pnpm run test:snapshot -- -t 'replays trade-mcp-empty'` checks the real MCP consumer, discovered tool schemas and model-visible context in a recorded Harness Session. These checks do not establish real Workbuddy extraction quality or a public deployment.

Matching uses private structured filtering and explicit explanations, without predictive scores. Margin estimates exclude freight, duties, fees and returns. Performance is a labelled merchant report; unavailable views/carts stay null. Do not add revenue across currencies. Two graphic briefs and eight text drafts are generated per Launch; image rendering and brand-tone copy generation remain incomplete. See the plan for other gaps. Back up SQLite while the server is stopped. Deployment token mappings are not a production identity service.

## Dev Note

None.
