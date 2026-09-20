/** Agent-native API client; no database access and no embedded credentials. */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const actions = {
  create_company: 'company.save', ingest_company_source: 'evidence.add', create_product: 'product.save',
  update_product_fact: 'product.save', build_opportunity: 'opportunity.build',
}

/** Call a stable API capability with a scoped agent credential.
 * @param operation - Capability name.
 * @param input - Validated by the server's published schema.
 * @param config - Server URL, scoped token and transport.
 * @returns Parsed API result; failed responses reject without printing credentials.
 */
export async function call(operation, input, config) {
  const base = new URL(config.url)
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('HTTPS or loopback is required')
  if (base.username || base.password || base.search || base.hash) throw new Error('API URL must not include credentials, query or fragment')
  if (!config.token || config.token.length < 32) throw new Error('Scoped agent credential is required')
  let path, body
  if (operation === 'workspace' || operation === 'manifest') path = `/api/${operation}`
  else if (operation === 'get_missing_fields') path = `/api/products/readiness?id=${encodeURIComponent(input.id)}`
  else {
    if (!Object.hasOwn(actions, operation)) throw new Error('Unsupported Agent capability')
    path = '/api/commands'; body = { ...input, type: actions[operation] }
  }
  const response = await (config.fetch ?? fetch)(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${config.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs ?? 30000) })
  const result = await response.json()
  if (!response.ok) throw new Error(`Commerce API ${response.status}: ${result.error ?? 'request_failed'}`)
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const operation = process.argv[2], filename = process.argv[3]
    const input = filename ? JSON.parse(await readFile(filename, 'utf8')) : {}
    const result = await call(operation, input, { url: process.env.COMMERCE_API_URL, token: process.env.COMMERCE_AGENT_TOKEN })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'API call failed'}\n`); process.exitCode = 1 }
}
