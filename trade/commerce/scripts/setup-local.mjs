/** Provision an empty local workspace with distinct human and agent credentials. */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'

const directory = resolve('data')
const environment = resolve('.env.local')
const credentialsPath = resolve(directory, 'local-access.json')
if (existsSync(environment) || existsSync(credentialsPath)) throw new Error('Local configuration already exists; inspect it instead of replacing credentials.')
mkdirSync(directory, { recursive: true })
const factory = randomUUID(), merchant = randomUUID()
const credentials = ['factory', 'factory-agent', 'merchant', 'merchant-agent'].map(role => ({ role, subjectId: role.startsWith('factory') ? factory : merchant, token: randomBytes(32).toString('hex') }))
const config = { database: resolve(directory, 'commerce.sqlite'), credentials, maxBodyBytes: 1048576, matchLimit: 3, shopify: [] }
writeFileSync(credentialsPath, JSON.stringify({ credentials }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
writeFileSync(environment, `COMMERCE_CONFIG='${JSON.stringify(config)}'\n`, { flag: 'wx', mode: 0o600 })
process.stdout.write(`Empty workspace configured. Read your local credentials at ${credentialsPath}\n`)
