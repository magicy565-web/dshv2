# Catalog and Markets

Normalize every offer around an opaque product ID and variant ID. A variant record includes title, selected options, image, price, compare-at price, currency, availability, inventory timestamp, SKU/GTIN when the merchant exposes it, selling-plan terms, shipping eligibility, and return-policy reference. Preserve the source store and retrieval time.

Resolve market before ranking or cart mutation. Market resolution includes destination country/region, language, currency, tax treatment, price list, inventory location, shipping zones, and legal restrictions. Never convert currency or estimate tax in the model when the Storefront API can provide the value. If the provider cannot calculate a material fee, label it as unknown and require confirmation after calculation.

Localized catalog reads are independent snapshots. A product available in one market may be unavailable, differently priced, or subject to different policies in another. A market or currency change invalidates the previous offer confirmation and requires a fresh cart total.

For logged-in buyers, use Customer Account authorization only for the scopes and fields needed for the requested operation. Do not expose order history, addresses, or personalized prices to an unverified shopper or another tenant.
