---
kind: implemented
area: architecture
date: 2026-09-16
---

# Site revisions publish through an explicit Shopify adapter

`@deepseek-ai/dsh-site` keeps revision storage and publication jobs provider-neutral. `createShopifySitePublisher` is the explicit consumer adapter: the caller selects the OAuth theme and supplies the approved renderer, while the adapter derives one stable idempotency key from the immutable revision id. Theme file policy remains owned by the Shopify provider.
