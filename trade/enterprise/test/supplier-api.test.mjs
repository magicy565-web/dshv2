/** External credentials are checked by the supplier route on the shipped dsh Web profile. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('external supplier credentials work through a real dsh HTTP server without browser login', { timeout: 60000 }, async t => {
  const parent = join(root, '.trade-runtime')
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'supplier-api-'))
  let child
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  const token = 'supplier-test-token-000000000000000000000000'
  const patch = join(directory, 'override.yml')
  await writeFile(patch, JSON.stringify([{ id: 'trade-enterprise', config: {
    directory: join(directory, 'data'), externalAgentToken: token, externalSupplierRecords: [], externalDocumentIds: [],
    maxFileBytes: 1048576, maxTotalBytes: 2097152, maxExtractedCharacters: 10000,
    knowledgeChunkCharacters: 512, maxKnowledgeResults: 5, maxDecompressedBytes: 1048576,
    maxArchiveEntries: 100, maxTableCells: 1000,
  } }]))
  child = spawn(process.execPath, [join(root, 'apps/cli/lib/bin.js'), '--profile', 'trade', '--from-default-profile', 'web', '--patch', join(root, 'trade/cordis.patch.yml'), '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: root, windowsHide: true, env: { ...process.env, DSH_HOME: join(directory, 'home') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stderr.on('data', value => { logs += value })
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dsh startup timed out: ${logs}`)), 30000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`dsh exited ${code}: ${logs}`)) })
    child.stdout.on('data', value => {
      logs += value
      const match = logs.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
  })
  const request = (path, key) => fetch(`${origin}/supplier/v1/${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10000) })
  assert.equal((await request('query')).status, 401)
  assert.equal((await request('query', 'incorrect')).status, 401)
  const manifest = await request('manifest', token)
  assert.equal(manifest.status, 200)
  assert.equal((await manifest.json()).readOnly, false)
  const query = await request('query', token)
  assert.equal(query.status, 200)
  assert.equal(query.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await query.json()).records, [])
  assert.deepEqual((await (await request('search?query=viscose', token)).json()).matches, [])
  assert.equal((await request('document?fileId=00000000-0000-4000-8000-000000000001&chunk=1', token)).status, 404)
})
