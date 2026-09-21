# Agent Note: Shopify Site capability seams

Status: implemented

## Problem

AI site editing needs tenant-safe identifiers and a stable provider-independent contract before Shopify HTTP, OAuth, UI, and publishing workflows are added.

## Decision

The repository now exposes `@deepseek-ai/dsh-shopify` for branded tenant and store identities, explicit public/OAuth resolution, catalog projections, and theme publication. `@deepseek-ai/dsh-site` owns tenant-scoped site revisions, typed `SiteChangeSet` values, validation, and publication jobs. Providers receive an explicit resolved specification; model-produced values never contain raw Shopify API requests.

## Alternatives considered

**Put Shopify calls directly in the Site package.** Rejected because OAuth, credentials, API versions, and provider failures would become inseparable from the site data contract.

**Use unbranded string identifiers.** Rejected because tenant and Shopify resource ids could be passed across ownership scopes accidentally.

## Consequences

Consumers can build public-store and OAuth-store implementations against one typed seam. The memory Site provider separates queued jobs from execution, commits a distinct published revision only on provider success, and prevents concurrent publication of one site. The authenticated editor exposes the queue operation through the enterprise Host route table; a worker supplies its external side effect through the Site transaction, which commits the final job status before returning. Detached records preserve revision immutability. Snapshot imports validate ownership references before replacing state; interrupted running jobs become failed because local state cannot establish remote side effects. Explicit snapshot saves use atomic file replacement but do not provide automatic durable commits or multi-process locks. The [source-project decision](2026-09-20-site-source-projects.md) owns durable activity projection and the enterprise publication worker. Package tests do not establish live Shopify publication.
