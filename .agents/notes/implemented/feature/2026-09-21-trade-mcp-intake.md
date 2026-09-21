# Agent Note: Trade MCP supplier intake

Status: implemented

English | [中文](2026-09-21-trade-mcp-intake.zh.md)

## Problem

Suppliers using an external assistant need durable company and product records without configuring a second model runtime. A local Skill and HTTP script do not expose discoverable MCP tools or preserve an explicit intake submission across conversations.

## Decision

[Commerce](../../../../trade/commerce/README.md#mcp-onboarding) exposes stateless Streamable HTTP at `/mcp` using the official SDK. Every request authenticates a server-bound supplier Agent credential. Host and Origin allowlists protect the endpoint; a public deployment owns HTTPS, account provisioning and quotas. The MCP adapter shares Commerce authorization, version checks, transactions and idempotency receipts. It cannot assert human identity or perform confirmation, disclosure or publication.

Immutable source text and an exact submission scope persist beside business records. Draft writes cite excerpts in owned sources, create linked evidence and force changed values to private, unverified facts. Batch failure rolls back every product. Source labels never cause file reads or URL requests. Client-supplied text remains untrusted even when an excerpt matches.

Submission identifies the company revision and explicitly selected product revisions. Sourced names are required; missing optional commercial facts are allowed. Editing drafts or adding sources clears the submission, while current versions and live name evidence determine its freshness after other business operations. The client owns conversation history, document extraction and the accuracy of proposed values.

The [Commerce ownership decision](../architecture/2026-09-21-commerce-business-runtime-separation.md) remains active: MCP writes Commerce records and does not replace Enterprise GEO storage, runtime providers or commercial approval rules. Its separation rationale is not superseded.

## Alternatives considered

**Expose every business command through one generic tool.** A closed intake catalog gives external agents focused schemas and excludes privileged actions from discovery; the business service independently enforces permissions.

**Keep progress only in MCP sessions.** Stateless requests and durable business receipts allow reconnection, restart and retry without binding record ownership to a transport session.

**Let the server open client paths or fetch arbitrary source URLs.** Explicit text submission keeps file selection with the client and avoids giving source labels server filesystem or network authority. Binary ingestion remains outside this transport.

## Consequences

Official-client protocol tests cover sourced company/product intake, exact submission, database reopening, retry conflicts, batch rollback, source revocation and cross-supplier refusal. An owner-local tool catalog checks discovery prose and annotations; the [recorded Harness Session](../../../../snapshots/session/trade-mcp-empty/session.v3.jsonl) checks the real MCP consumer, discovered schemas and model-visible context. The compiled Next.js route is exercised over HTTP with a private database and an operating-system-assigned port. Workbuddy UI compatibility, real extraction, self-service identity and public deployment still require their respective integrations; local protocol checks do not establish them.
