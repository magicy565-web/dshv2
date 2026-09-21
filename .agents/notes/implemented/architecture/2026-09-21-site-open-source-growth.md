# Agent Note: Open-source discovery, analytics and public consultation

Status: implemented

English | [中文](2026-09-21-site-open-source-growth.zh.md)

## Problem

Enterprise websites need discoverable product answers, traffic evidence and an inquiry path without requiring paid analytics or a second agent platform. Reusing the authenticated workspace Agent would expose tools and private context to anonymous visitors.

## Decision

The enterprise consumer composes approved company facts into ordinary versioned source. Buying guides, visible FAQ answers and structured data retain the same facts and limitations. Maintained parse5 and sitemap libraries produce publication metadata and discovery output. Public URLs and integration settings participate in the compiled digest, so reviewing a different origin cannot overwrite a live build with the same source revision. The local database uses a monotonic migration to retain existing published bytes while indexing builds by digest.

Self-hosted Umami owns traffic collection and reporting. The published page uses its official tracker; the private workspace reads its metrics and links to its dashboard. The adapter keeps bounded UTM fields, strips other query parameters and referrer paths, and never sends inquiry contents or consultation text as analytics properties. Browser-reported attribution is unverified. Durable inquiry receipts, pageviews, AI referrals and crawler observations are different evidence; crawler User-Agent claims and manually supplied model citations remain observations rather than verified outcomes.

Public consultation reuses the Harness loop with an explicitly selected model route, a fresh Session, complete public-only prompt and no tools. The anonymous API accepts bounded questions and history, never a workspace Session identifier. Published facts are untrusted reference data rather than privileged instructions. Cancellation disposes the Agent, quotas survive restarts, and a changed publication invalidates an outstanding answer. Consultation logging follows the existing Session mechanism; operators own retention. An explicit visitor action copies answers into the inquiry form, whose durable receipt remains separate from model text.

The opaque page sandbox permits only its inquiry endpoint, optional consultation endpoint and configured Umami origin for requests. No analytics credentials enter source. A local model and self-hosted Umami require no paid service subscription; deployment and operation remain administrator responsibilities.

The [source-project decision](2026-09-20-site-source-projects.md) retains authority over revisions, source isolation and publication. The [Shopify capability decision](2026-09-15-shopify-site-capability-seams.md) and [commerce completion proposal](../../proposed/architecture/2026-09-15-shopify-site-completion.md) retain their independent commerce scope. Their rationale is not superseded by these optional enterprise integrations.

The private operations panel reads Umami metrics and integrates SearXNG search, ntfy notifications and standard EspoCRM Lead APIs. External writes persist a claim before dispatch; uncertain receipts remain unknown until operator reconciliation or confirmed retry. Search results, manual citations, website-model tests and unverified User-Agent counts are distinct evidence, not a combined AI ranking. Separate enterprise deployments reuse existing authorization without adding shared multi-tenant accounts.

## Alternatives considered

**Implement another analytics database and dashboard.** Rejected because Umami already owns collection, attribution and reporting. A small integration avoids maintaining a competing metric implementation.

**Embed an independent agent platform or reuse an editor conversation.** Rejected because the existing loop already provides model routing, cancellation and Session logging, while anonymous access needs a separate public context with no tools.

**Generate unsupported claims to fill every marketing page.** Rejected because an empty evidence base cannot substantiate certificates, case studies, prices or competitor comparisons. Missing facts remain explicit omissions.

## Consequences

Saved versions preserve discovery metadata and integration choices. Unpublishing removes discovery files, consultation and new inquiries. Traffic reporting requires an operator-provided Umami installation; browser tests simulate its external endpoint. The consultation browser test scripts only the external model and exercises the real profile and loop. Live local-model quality, public DNS, TLS and a real Umami deployment remain separate verification tasks. The template-catalog Session replay owns the model-visible parameter schema.
