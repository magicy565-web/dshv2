/** The public consultant uses the real loop while excluding ambient prompt context and tools. */
import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MockAdapter, textResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { siteConsultation, siteAgentConfig, translateSiteContent } from '../src/site-consultation.ts'
import { siteCompanyContent } from '../src/site-company-schema.ts'

it('answers from public facts through a tool-free, logged Agent and disposes its activity', async () => {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter([textResponse('We supply reviewed parts. Please send your requirements.')])
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  ctx.effect(() => ctx.systemPrompt.context({ name: 'private-workspace', order: 0, text: 'PRIVATE-DOCUMENT-CONTENT' }))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'private-persona', order: 0, text: 'PRIVATE-PERSONA' }))
  const content = siteCompanyContent.parse({ name: 'Public company', description: 'We supply reviewed parts.', business: 'Parts', email: '', phone: '', address: '', products: [], qualifications: [] })
  try {
    const answer = await siteConsultation(ctx, siteAgentConfig.parse({ provider: 'mock', model: 'mock' }))(content, { question: 'What do you supply?', history: [] }, new AbortController().signal)
    expect(answer).toContain('reviewed parts')
    expect(adapter.requests).toHaveLength(1)
    expect(JSON.stringify(adapter.requests[0])).toContain('Public company')
    expect(JSON.stringify(adapter.requests[0])).not.toContain('PRIVATE-')
    expect(adapter.requests[0]?.tools ?? []).toEqual([])
    expect(ctx.agents.list()).toHaveLength(0)
  } finally { await ctx.fiber.dispose() }
})

it('cancels an active public model request and releases its Agent before returning', async () => {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter(['hang'])
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const content = siteCompanyContent.parse({ name: 'Public company', description: 'Parts', business: '', email: '', phone: '', address: '', products: [], qualifications: [] })
  const controller = new AbortController()
  const answer = siteConsultation(ctx, siteAgentConfig.parse({ provider: 'mock', model: 'mock' }))(content, { question: 'Hello', history: [] }, controller.signal)
  const result = answer.then(() => 'unexpected-answer', () => 'cancelled')
  try {
    await vi.waitFor(() => expect(adapter.requests).toHaveLength(1))
    controller.abort()
    expect(await result).toBe('cancelled')
    expect(ctx.agents.list()).toHaveLength(0)
    await expect(siteConsultation(ctx, siteAgentConfig.parse({ provider: 'mock', model: 'mock', maxContextCharacters: 1 }))(content, { question: 'Hello', history: [] }, new AbortController().signal)).rejects.toThrow('context limit')
    expect(adapter.requests).toHaveLength(1)
  } finally { controller.abort(); await result; await ctx.fiber.dispose() }
})

it('translates only public content and rejects model changes to contact identity', async () => {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const content = siteCompanyContent.parse({ name: 'Public company', description: 'Parts', business: '', email: 'sales@example.test', phone: '', address: '', products: [], qualifications: [] })
  const adapter = new MockAdapter([textResponse(JSON.stringify({ ...content, description: '零件' })), textResponse(JSON.stringify({ ...content, email: 'changed@example.test' }))])
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  ctx.effect(() => ctx.systemPrompt.context({ name: 'private', order: 0, text: 'PRIVATE-CONTEXT' }))
  const config = siteAgentConfig.parse({ provider: 'mock', model: 'mock' })
  try {
    expect(await translateSiteContent(ctx, config, content, 'zh-CN', new AbortController().signal)).toMatchObject({ description: '零件', email: 'sales@example.test' })
    await expect(translateSiteContent(ctx, config, content, 'zh-CN', new AbortController().signal)).rejects.toThrow('factual values')
    expect(adapter.requests.every(request => !request.tools?.length)).toBe(true)
    expect(JSON.stringify(adapter.requests)).not.toContain('PRIVATE-CONTEXT')
    expect(ctx.agents.list()).toHaveLength(0)
  } finally { await ctx.fiber.dispose() }
})
