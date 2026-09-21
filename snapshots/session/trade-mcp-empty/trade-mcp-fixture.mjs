/** Real Trade MCP transport with an empty, isolated supplier database. */
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { CommerceDatabase } from '../../../trade/commerce/src/database.ts'
import { CommerceService } from '../../../trade/commerce/src/service.ts'
import { mcpHandler } from '../../../trade/commerce/src/mcp.ts'
import { applyLoopbackServerEffect } from '../loopback-fixture-server.mjs'

/** Cordis fixture name. */
export const name = 'trade-mcp-fixture'
/** Tool registry used by the real MCP client. */
export const inject = ['tools']

/** Connect the shipped MCP consumer to the production handler over loopback HTTP.
 * @param ctx - Cordis context owning the client, database and listener.
 */
export async function apply(ctx) {
  const store = new CommerceDatabase(':memory:')
  const token = 'synthetic-supplier-snapshot-credential'
  const handle = mcpHandler({
    service: new CommerceService(store),
    credentials: [{ token, role: 'factory-agent', subjectId: '00000000-0000-4000-8000-000000000001' }],
    maxBodyBytes: 16000,
    config: { allowedHosts: ['127.0.0.1'], allowedOrigins: [] },
  })
  let url
  await applyLoopbackServerEffect(ctx, {
    label: name,
    onCleanup: () => store.close(),
    onListening: address => { url = `http://127.0.0.1:${address.port}/mcp` },
    requestListener: (incoming, outgoing) => {
      void (async () => {
        const parts = []
        for await (const part of incoming) parts.push(part)
        const body = Buffer.concat(parts)
        const request = new Request(url, {
          method: incoming.method,
          headers: incoming.headers,
          ...(body.length === 0 ? {} : { body }),
        })
        const response = await handle(request)
        outgoing.writeHead(response.status, Object.fromEntries(response.headers))
        outgoing.end(Buffer.from(await response.arrayBuffer()))
      })().catch(error => outgoing.destroy(error))
    },
  })
  await McpClient.apply(ctx, McpClient.Config({
    transport: 'streamable-http', serverName: 'trade', url,
    headers: { Authorization: `Bearer ${token}` },
    failOnStartupError: true,
    reconnect: { enabled: false },
  }))
}
