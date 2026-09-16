# Shopify official Agentive Shopping references

Checked against Shopify developer documentation on 2026-09-15:

- [Building with the Storefront API](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api): tokenless access supports products, collections, selling plans, search, and Cart read/write with query complexity limits; token-based access is required for additional protected features.
- [Cart](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart): a Cart is the buyer assistant that holds intended merchandise and buyer context.
- [Checkout migration](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/checkout): Checkout APIs are deprecated from 2024-04 and sunset in 2025-04; use Storefront Cart API or Checkout Kit. Storefront Cart API cart create/update operations do not fire webhooks.
- [Storefront API reference](https://shopify.dev/docs/api/storefront/latest): use the configured API version and send `Shopify-Storefront-Buyer-IP` where applicable so Shopify can distinguish buyers.

Re-read these pages when Shopify changes API versions or agent-facing commerce guidance.
