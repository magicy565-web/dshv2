/** Script only the external model; the browser still drives the shipped profile and real Agent loop. */
import type { Context } from '@deepseek-ai/cordis'
import assert from 'node:assert/strict'
import { MockAdapter, textResponse } from '../../../../packages/core/agent-loop/tests/mock-adapter.ts'

/** The fixture registers after the real LLM service is ready. */
export const inject = ['llm']

/** Register one deterministic model answer without replacing the consultation implementation.
 * @param ctx - Profile-owned model registry.
 */
export function apply(ctx: Context) {
  const adapter = new MockAdapter([options => {
    assert.deepEqual(options.tools ?? [], [])
    assert.match(JSON.stringify(options), /Acme Engineering/)
    return textResponse('We supply precision components. Please send your drawing and quantity. <script>throw new Error("unsafe")</script>')
  }])
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
}
