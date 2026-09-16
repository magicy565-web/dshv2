import { describe, expect, it } from 'vitest'
import { EncryptedTokenVault, WebhookInbox } from '../src/providers.ts'

describe('Shopify provider support', () => {
  it('round trips encrypted tokens and rejects tampering', () => {
    const vault = new EncryptedTokenVault(Buffer.alloc(32, 7)); const encrypted = vault.encrypt('secret-token')
    expect(vault.decrypt(encrypted)).toBe('secret-token')
    const parts = encrypted.split('.'); parts[1] = `${parts[1]}x`
    expect(() => vault.decrypt(parts.join('.'))).toThrow()
  })
  it('deduplicates webhook deliveries', () => { const inbox = new WebhookInbox(); expect(inbox.accept('e1')).toBe(true); expect(inbox.accept('e1')).toBe(false) })
})
