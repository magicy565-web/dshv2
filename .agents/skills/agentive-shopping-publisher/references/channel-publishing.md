# Agent channel publishing

Publishing a shopping capability is a separate artifact from publishing a theme. Create a versioned manifest containing:

- merchant and channel identity, supported markets/locales/currencies, and catalog freshness;
- discovery fields, ranking/sponsorship disclosure, product and policy URLs;
- supported actions (`discover`, `add_to_cart`, `update_cart`, `create_checkout`, `order_status`, and any cancellation/return action);
- authentication, shopper-consent requirements, scopes, rate limits, idempotency behavior, and webhook/callback endpoints;
- data retention, deletion, contact/support route, version, effective time, and revocation status.

Validate the manifest before publication and sign or authenticate it according to the target channel. Publish to a staging channel first, exercise the evaluation cases, then promote the same immutable version. Keep a kill switch that disables new cart or checkout actions while preserving order support. Revoking a channel must stop new transactions and invalidate channel credentials without deleting merchant order records.

Do not claim that a Shopify marketing page is an API protocol. Use the target channel's current technical specification and record the exact version and required scopes.
