/** Generate private deployment inputs; existing installations are never overwritten. */
import { randomBytes } from 'node:crypto'
import { writeFile, access, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = resolve(dirname(fileURLToPath(import.meta.url)), 'private')
await mkdir(directory, { mode: 0o700, recursive: true })
const [domain, metrics] = process.argv.slice(2)
const validDomain = value => typeof value === 'string' && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value)
if (!validDomain(domain) || !validDomain(metrics) || domain === metrics) throw new Error('Usage: node init.mjs www.company.example metrics.company.example (two different DNS names)')
for (const name of ['deployment.env', 'site-services.json', 'searxng.yml', 'restic-password']) {
  try { await access(resolve(directory, name)); throw new Error(`${name} already exists; edit the existing deployment instead`) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const secret = () => randomBytes(32).toString('hex')
const environment = { SITE_DOMAIN: domain, METRICS_DOMAIN: metrics, DSH_SITES_PUBLIC_URL: `https://${domain}`, SITE_MODEL: 'qwen3:8b', OLLAMA_API_KEY: 'local-only', POSTGRES_PASSWORD: secret(), UMAMI_APP_SECRET: secret(), UMAMI_2FA_KEY: secret(), CRM_DB_PASSWORD: secret(), CRM_ROOT_PASSWORD: secret(), CRM_ADMIN_PASSWORD: secret(), ADMIN_PORT: '3080', UMAMI_ADMIN_PORT: '3081', NTFY_PORT: '3082', CRM_PORT: '3083' }
await writeFile(resolve(directory, 'deployment.env'), Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 })
// The app's non-root container user must read the file; its parent directory stays operator-only on the host.
await writeFile(resolve(directory, 'site-services.json'), JSON.stringify({ search: { baseUrl: 'http://searxng:8080/' } }, null, 2) + '\n', { flag: 'wx', mode: 0o644 })
await writeFile(resolve(directory, 'searxng.yml'), `use_default_settings: true\nserver:\n  secret_key: ${secret()}\n  limiter: false\nsearch:\n  formats: [html, json]\n`, { flag: 'wx', mode: 0o644 })
await writeFile(resolve(directory, 'restic-password'), secret() + '\n', { flag: 'wx', mode: 0o600 })
console.log('Created deployment inputs. Use the self-hosting guide to start services and add private API keys. No service has been launched.')
