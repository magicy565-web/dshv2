# Shopify-GEO development plan

English | [中文](shopify-geo-development-plan.zh.md)

This plan defines the remaining implementation work for the Workspace-led Shopify-GEO product flow. The Enterprise package provides structured readiness, authenticated previews, public HTML/JSON-LD projection, Shopify OAuth, webhook verification, bounded sync retries and independent site publication. The Workspace owns product facts, evidence, human verification, store selection, publication approval, retries and audit records. Shopify owns commerce state such as price, inventory and availability.

## 1. GEO product data

Add structured variant identity fields for SKU, MPN, GTIN, options, specifications and media. Keep one stable product slug and one canonical URL per locale. Record field-level verification receipts with reviewer, timestamp, source ids and product revision. Mark legacy free-text records as `structured_product_missing`; never infer missing commercial or identifier values.

## 2. Readiness and publication

Evaluate Entity, Understanding, Facts, Evidence, Site Publication, Discovery and Shopify Sync independently. Discovery must execute checks for the public route, HTTP status, canonical URL, robots, Sitemap, JSON-LD/HTML consistency and private-field filtering. Site publication is independent from Shopify Commerce Sync. A product enters the public projection only after human verification and successful site publication.

## 3. Public projection

Generate visible HTML and JSON-LD from one typed projection. Include `Product`, `Organization`, `Brand`, `ProductGroup`, `ProductVariant` and `PropertyValue` when their source fields are public and verified. Generate `Offer` only from Shopify-returned price and availability. Generate paired `hreflang` links for available locales. Remove unpublished products from the Sitemap and return the documented unavailable status.

## 4. Shopify connections and jobs

Keep managed stores and user-owned OAuth stores behind `StoreConnection`. Validate OAuth state, callback HMAC, redirect URI and offline-token exchange. Encrypt tokens at rest. Create revision-scoped `PublishJob` records with stable idempotency keys, bounded retries, concurrency protection, attempt errors and audit entries. Verify Webhook HMAC before parsing, deduplicate delivery ids and ignore stale external updates.

## 5. Workspace workflow

Add product readiness, evidence review, revision comparison, site preview, store selection, publish, unpublish, retry and publication-history views. Keep private facts and evidence out of public responses. Show Shopify commerce status separately from Shopify-GEO Site status.

## 6. Verification

Add SQLite migration tests for legacy records and publication fields. Add Host tests for readiness blockers, slug conflicts, site publication, unpublication, OAuth failures, webhook deduplication, retry classification and Shopify state projection. Add browser tests for unauthenticated product pages, HTTP status, canonical, `hreflang`, JSON-LD consistency, private-field filtering, mobile layout, robots and Sitemap membership. Run documentation pairing checks, package type checks, lint and the focused Enterprise tests before release.

## 7. External acceptance

Use a Shopify test store and an HTTPS deployment to create one product group with two variants. Verify Workspace approval, Shopify fields, returned prices and availability, public HTML, JSON-LD, Rich Results parsing, Search Console fetchability and Merchant Center field consistency. Record only executed results; credentials remain deployment configuration.
