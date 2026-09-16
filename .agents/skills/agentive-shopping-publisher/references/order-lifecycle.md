# Order lifecycle

Model order state as provider facts, not inferred text. At minimum handle pending/authorized payment, paid, partially fulfilled, fulfilled, cancelled, refunded, partially refunded, returned, and disputed states. Preserve provider timestamps and request IDs.

Cancellation and refund actions require a fresh order read, shopper authorization, and an explicit summary of amount, items, fees, and expected timing. A retry uses the same idempotency key and first queries whether the previous mutation completed. Never promise a refund date the merchant API did not provide.

Use authenticated, deduplicated webhooks for fulfillment, cancellation, refund, return, and dispute changes. Protect newer state from out-of-order deliveries. When policy or provider behavior is ambiguous, hand off to merchant support with the opaque order reference and an audit link, not the shopper's payment data.
