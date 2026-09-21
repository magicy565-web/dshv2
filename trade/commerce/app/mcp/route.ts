/** Remote MCP transport uses the same process-owned Commerce database as the Web API. */
import { applicationMcpHandler } from '../../src/server.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Dispatch MCP initialization, discovery and tool calls after request authentication.
 * @param request - Incoming Streamable HTTP request.
 * @returns JSON-RPC result or a protocol/authentication error.
 */
export async function POST(request: Request) { return applicationMcpHandler()(request) }

/** Refuse standalone event streams for this stateless MCP endpoint.
 * @param request - Incoming request.
 * @returns An authenticated method-not-allowed response.
 */
export async function GET(request: Request) { return applicationMcpHandler()(request) }

/** Refuse session deletion because this endpoint retains no protocol sessions.
 * @param request - Incoming request.
 * @returns An authenticated method-not-allowed response.
 */
export async function DELETE(request: Request) { return applicationMcpHandler()(request) }
