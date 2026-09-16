---
description: "Shopify store capability definitions for public and OAuth-connected stores."
kind: "package-reference"
---

# @deepseek-ai/dsh-shopify

English | [中文](README.zh.md)

## Summary

This package defines the tenant-scoped Shopify service seam. It keeps store mode, tenant identity, catalog projections, theme publishing and opaque resource identifiers explicit. Providers implement Shopify OAuth and HTTP behavior; consumers resolve a `ShopifyStoreSpec` before calling a provider.

## Known Limitations and Deferred Work

- No Shopify HTTP client, OAuth callback handler, token encryption, webhook registration, or settlement behavior is included yet.
- Product and theme projections intentionally exclude raw Shopify identifiers from consumer-facing records.

## Model Experience

No direct model-facing tool is included. Consumers own tool schemas and session events.

#### KV Cache effect

None.
