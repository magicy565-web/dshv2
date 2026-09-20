/** Bind the local trade deployment to Commerce without printing credentials or importing business data. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const environment = resolve(root, 'trade/commerce/.env.local')
const source = readFileSync(environment, 'utf8')
const match = /^COMMERCE_CONFIG='([^\r\n]+)'\r?$/m.exec(source)
if (!match) throw new Error('Run setup:local first; expected a single COMMERCE_CONFIG JSON assignment.')
const config = JSON.parse(match[1])
const factory = config.credentials.filter(c => c.role === 'factory')
if (factory.length !== 1) throw new Error('Local setup requires exactly one factory binding; configure multi-factory deployments explicitly.')
const path = resolve(root, '.trade-runtime/commerce-link.json')
const existing = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
if (Boolean(config.enterprise) !== Boolean(existing) || (existing && (existing.token !== config.enterprise.token || config.enterprise.factoryId !== factory[0].subjectId))) throw new Error('Existing enterprise binding does not match; refusing to replace it.')
const merchant = config.credentials.filter(c => c.role === 'merchant')
if (merchant.length !== 1 || (config.enterprise?.merchantId && config.enterprise.merchantId !== merchant[0].subjectId)) throw new Error('Local setup requires exactly one matching merchant binding.')
const secret = existing?.token ?? randomBytes(32).toString('hex')
config.enterprise ??= { token: secret, factoryId: factory[0].subjectId, returnUrl: 'http://127.0.0.1:3080/', ticketTtlMs: 60000, sessionTtlMs: 3600000 }
config.enterprise.merchantId = merchant[0].subjectId
config.enterpriseStore ??= { timeoutMs: 120000, maxResponseBytes: config.maxBodyBytes }
config.runtime ??= { profile: 'sdk', provider: 'deepseek-official', model: 'deepseek-v4-flash', dshHome: resolve(root, '.trade-runtime'), processCwd: resolve(root, '.trade-workspace'), requestTimeoutMs: 120000, maxTokens: 4096 }
mkdirSync(dirname(path), { recursive: true })
writeFileSync(environment, source.replace(match[0], `COMMERCE_CONFIG='${JSON.stringify(config)}'`), { mode: 0o600 })
writeFileSync(path, JSON.stringify({ ...(existing ?? { url: 'http://127.0.0.1:3100/', token: secret, timeoutMs: 150000, maxBodyBytes: config.maxBodyBytes }), merchantId: merchant[0].subjectId }) + '\n', { flag: existing ? 'w' : 'wx', mode: 0o600 })
process.stdout.write('Local enterprise link configured. Restart Commerce and trade/dev.cmd. Business records transfer when the user opens Product commercialization.\n')
