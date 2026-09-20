/** Template versions retain parameters while refusing to overwrite source edits. */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'
import { SiteTemplateService, SITE_TEMPLATE_RECEIPT } from '../src/templates.ts'
import type { SiteTemplateId, SiteTemplateProvider } from '../src/template-types.ts'

const id = brandString<SiteTemplateId>('test-site')
const provider: SiteTemplateProvider = {
  descriptor: { id, version: '1', name: 'Test', description: 'Test fixture', parameters: {} },
  resolve(input) {
    if (input === null || typeof input !== 'object' || !('name' in input) || typeof input.name !== 'string') throw new Error('Name required')
    return { name: input.name }
  },
  render: input => ({ framework: 'static', files: [
    { path: 'index.html', encoding: 'utf8', content: `<h1>${input.name as string}</h1>` },
    { path: 'style.css', encoding: 'utf8', content: 'body{color:black}' },
  ] }),
}

describe('template service', () => {
  it('removes effect-owned registrations and rejects duplicates and missing exact versions', async () => {
    const ctx = new Context()
    const templates = new SiteTemplateService(ctx)
    try {
      ctx.effect(() => templates.register(provider))
      expect(templates.list()).toHaveLength(1)
      expect(() => templates.register(provider)).toThrow('already registered')
      expect(() => templates.generate({ id, version: '2', parameters: { name: 'Example' } })).toThrow('not installed')
      expect(() => templates.generate({ id, version: '1', parameters: {} })).toThrow('Name required')
    } finally { await ctx.fiber.dispose() }
    expect(templates.list()).toEqual([])
  })

  it('pins versions, supports parameter updates and keeps source readable without its provider', async () => {
    const ctx = new Context()
    try {
      const templates = new SiteTemplateService(ctx)
      const dispose = templates.register(provider)
      const original = templates.generate({ id, version: '1', parameters: { name: 'First' } })
      const next = templates.regenerate(original, { name: 'Second' })
      expect(original.files[0]?.content).toBe('<h1>First</h1>')
      expect(next.files[0]?.content).toBe('<h1>Second</h1>')
      expect(templates.inspect(next)).toMatchObject({ sourceEdited: false, receipt: { id, version: '1', parameters: { name: 'Second' } } })
      const reordered = { ...next, files: [...next.files].reverse() }
      expect(templates.inspect(reordered).sourceEdited).toBe(false)
      expect(templates.inspect({ ...next, files: [...next.files, next.files[0]!] }).sourceEdited).toBe(true)
      dispose(); dispose()
      expect(templates.inspect(next).sourceEdited).toBe(false)
      expect(() => templates.regenerate(next, { name: 'Third' })).toThrow('not installed')
    } finally { await ctx.fiber.dispose() }
  })

  it('refuses manual source edits, missing receipts and malformed durable receipts', async () => {
    const ctx = new Context()
    try {
      const templates = new SiteTemplateService(ctx)
      templates.register(provider)
      const project = templates.generate({ id, version: '1', parameters: { name: 'Example' } })
      const edited = { ...project, files: project.files.map(file => file.path === 'index.html' ? { ...file, content: '<h1>Manual edit</h1>' } : file) }
      expect(templates.inspect(edited).sourceEdited).toBe(true)
      expect(() => templates.regenerate(edited, { name: 'Replacement' })).toThrow('manual edits')
      expect(() => templates.inspect({ ...project, files: [] })).toThrow('no template receipt')
      for (const content of ['null', '[]', '{}', '{"format":2}', '{']) {
        expect(() => templates.inspect({ ...project, files: [{ path: SITE_TEMPLATE_RECEIPT, encoding: 'utf8', content }] })).toThrow()
      }
    } finally { await ctx.fiber.dispose() }
  })

  it('rejects unsafe provider files and provider-authored receipts', async () => {
    const ctx = new Context()
    try {
      const templates = new SiteTemplateService(ctx)
      const remove = templates.register({ ...provider, render: () => ({ framework: 'static', files: [{ path: '../escape.html', content: '', encoding: 'utf8' }] }) })
      expect(() => templates.generate({ id, version: '1', parameters: { name: 'Example' } })).toThrow('portable')
      remove()
      templates.register({ ...provider, render: () => ({ framework: 'static', files: [{ path: SITE_TEMPLATE_RECEIPT, content: '{}', encoding: 'utf8' }] }) })
      expect(() => templates.generate({ id, version: '1', parameters: { name: 'Example' } })).toThrow('cannot supply')
    } finally { await ctx.fiber.dispose() }
  })
})
