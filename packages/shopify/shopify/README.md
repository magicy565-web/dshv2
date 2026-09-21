---
description: "Shopify store capability definitions for public and OAuth-connected stores."
kind: "package-reference"
---

# @deepseek-ai/dsh-shopify

English | [中文](README.zh.md)

## Summary

This package defines the tenant-scoped Shopify service seam. It keeps store mode, tenant identity, catalog projections, theme publishing and opaque resource identifiers explicit. Providers implement Shopify OAuth and HTTP behavior; consumers resolve a `ShopifyStoreSpec` before calling a provider.

## Known Limitations and Deferred Work

- `GraphqlStoreProvider` reads catalog and themes through `ShopifyGraphqlClient`. OAuth callbacks, encrypted credentials and queue execution belong to the enterprise Host; this package does not operate settlement.
- Theme publication accepts approved text paths and `OnlineStoreTheme` IDs, waits for the returned write job, promotes the theme and verifies its live role. Async writes require explicit polling limits and cancellation; the enterprise worker sets one transport attempt so ambiguous mutations require reconciliation. Development-store publication remains a separate acceptance check.

## Model Experience

No direct model-facing tool is included. Consumers own tool schemas and session events.

#### KV Cache effect

None.
