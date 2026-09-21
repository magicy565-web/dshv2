/** Deployment initialization stays private, validates domains and refuses destructive reinitialization. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, copyFile, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load as parse } from 'js-yaml'

test('initialization creates independent secrets and preserves existing installation inputs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'site-deployment-'))
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  const script = join(directory, 'init.mjs')
  await copyFile(new URL('../sites/deploy/init.mjs', import.meta.url), script)
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true })
  assert.notEqual(run('https://bad.example', 'metrics.example').status, 0)
  assert.notEqual(run('same.example', 'same.example').status, 0)
  const result = run('www.company.example', 'metrics.company.example')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.signal, null)
  const file = join(directory, 'private', 'deployment.env')
  const environment = await readFile(file, 'utf8')
  const values = Object.fromEntries(environment.trim().split('\n').map(line => line.split('=')))
  assert.match(values.POSTGRES_PASSWORD, /^[a-f0-9]{64}$/)
  assert.notEqual(values.POSTGRES_PASSWORD, values.CRM_DB_PASSWORD)
  assert.ok(!result.stdout.includes(values.POSTGRES_PASSWORD))
  assert.notEqual(run('www.new.example', 'metrics.new.example').status, 0)
  assert.equal(await readFile(file, 'utf8'), environment)
  const services = JSON.parse(await readFile(join(directory, 'private', 'site-services.json'), 'utf8'))
  assert.deepEqual(services, { search: { baseUrl: 'http://searxng:8080/' } })
  assert.equal(parse(await readFile(join(directory, 'private', 'searxng.yml'), 'utf8')).search.formats.includes('json'), true)
})

test('only the proxy exposes public ports and backup volumes are read-only', async () => {
  const compose = parse(await readFile(new URL('../sites/deploy/compose.yml', import.meta.url), 'utf8'))
  for (const [name, service] of Object.entries(compose.services)) {
    if (name !== 'caddy') for (const port of service.ports ?? []) assert.ok(port.startsWith('127.0.0.1:'), name)
  }
  assert.ok(compose.services.backup.volumes.filter(value => value.includes('/snapshot')).every(value => value.endsWith(':ro')))
  const proxy = await readFile(new URL('../sites/deploy/Caddyfile', import.meta.url), 'utf8')
  assert.match(proxy, /path \/sites-live\/\* \/robots.txt/)
  assert.match(proxy, /path \/script.js \/api\/send/)
  assert.equal((proxy.match(/respond "Not found" 404/g) ?? []).length, 2)
})
