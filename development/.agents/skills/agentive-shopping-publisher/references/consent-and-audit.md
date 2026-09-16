# Consent and audit

A confirmation is valid only when it names the exact cart contents, quantities, total, currency, destination, shipping method, taxes/fees, recurring terms, and return policy. Record the actor, timestamp, locale, store connection, cart snapshot, offer retrieval times, and idempotency key. Never treat a generic message such as "buy it" as confirmation when material values are unresolved.

Use idempotency keys for cart creation, checkout handoff, and any order mutation. On timeout, query the provider before retrying. If the provider cannot prove whether an operation completed, stop and surface the uncertainty.

Retain only data needed for order support and audit. Encrypt credentials and tokens, redact payment data, and provide deletion/export behavior required by the merchant and jurisdiction. Webhooks must be authenticated, deduplicated, and tenant-scoped.
