import assert from 'node:assert/strict'
import test from 'node:test'
import { toShopifyProduct } from '../src/shopify.ts'
import { productFixture } from './geo-fixture.mjs'

test('Shopify mapping keeps source identifiers and excludes commercial values', () => {
  const product = productFixture()
  const mapped = toShopifyProduct(product, 'sample-product')
  assert.equal(mapped.handle, 'sample-product')
  assert.equal(mapped.variants[0].barcode, product.identity.gtin)
  assert.equal(mapped.variants[0].inventoryManagement, null)
  assert.ok(!('price' in mapped.variants[0]))
  assert.ok(mapped.descriptionHtml.includes('120 g/m'))
})
