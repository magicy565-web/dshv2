/** Verify the compiled Next.js MCP route with a real HTTP client and private storage. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const root = fileURLToPath(new URL('../', import.meta.url))

test('built /mcp route persists supplier drafts without a configured model runtime', { skip: !existsSync(join(root, '.next/BUILD_ID')) && 'Build Commerce before the artifact smoke', timeout: 60000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'trade-mcp-built-')), database = join(directory, 'commerce.sqlite')
  const token = 'synthetic-built-mcp-credential-0001', subjectId = randomUUID()
  const env = { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', COMMERCE_CONFIG: JSON.stringify({ database, credentials: [{ token, role: 'factory-agent', subjectId }], maxBodyBytes: 16000, matchLimit: 3, shopify: [] }) }
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key]
  let child, client, stopped
  t.after(async () => {
    try { await client?.close() }
    finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill()
      await stopped
      rmSync(directory, { recursive: true, force: true })
    }
  })
  child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '0'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  stopped = new Promise(resolve => { child.once('close', resolve); child.once('error', resolve) })
  const ready = await new Promise((resolve, reject) => {
    let output = '', address
    const deadline = setTimeout(() => reject(new Error(`MCP server readiness timed out: ${output}`)), 30000)
    const inspect = chunk => {
      output = (output + chunk.toString()).slice(-5000)
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output)
      if (match) address = match[0]
      if (address && /Ready in/.test(output)) { clearTimeout(deadline); resolve(address) }
    }
    child.stdout.on('data', inspect); child.stderr.on('data', inspect)
    child.once('error', error => { clearTimeout(deadline); reject(error) })
    child.once('exit', (code, signal) => { clearTimeout(deadline); reject(new Error(`MCP server exited before readiness: ${code}/${signal}: ${output}`)) })
  })
  client = new Client({ name: 'built-route-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', ready), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  assert.equal((await client.listTools()).tools.length, 8)
  for (const [name, args] of [
    ['trade_start_onboarding', { requestId: randomUUID() }],
    ['trade_save_company', { requestId: randomUUID(), expectedRevision: 0, facts: { legal_name: { value: 'Built Route Factory', sources: [] } } }],
  ]) {
    const response = await client.callTool({ name, arguments: args })
    assert.notEqual(response.isError, true, JSON.stringify(response.content))
  }
  const reader = new DatabaseSync(database, { readOnly: true })
  try {
    const company = JSON.parse(reader.prepare('SELECT data FROM company WHERE id=?').get(subjectId).data)
    assert.equal(company.facts.legal_name.value, 'Built Route Factory')
    assert.equal(company.facts.legal_name.visibility, 'CONFIDENTIAL')
    assert.equal(reader.prepare('SELECT count(*) AS count FROM onboarding').get().count, 1)
  } finally { reader.close() }
})
