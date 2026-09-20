/** Lazy process-owned composition; secrets never enter the browser bundle. */
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { z } from 'zod'
import { CommerceDatabase, BusinessError } from './database.ts'
import { CommerceService } from './service.ts'
import { credentialsSchema, handler } from './http.ts'
import { AgentGateway, DeepSeekRuntime } from './runtime.ts'
import { ShopifyGateway, shopifyConfig, shopifyProvider } from './shopify.ts'
import { id } from './schema.ts'
import { EnterpriseLink, enterpriseLinkConfig } from './enterprise-link.ts'
import { EnterpriseStore, enterpriseStoreConfig } from './enterprise-store.ts'

const configSchema = z.object({
  database: z.string().min(1), credentials: credentialsSchema,
  maxBodyBytes: z.number().int().positive(), matchLimit: z.number().int().positive().max(10),
  shopify: z.array(shopifyConfig.extend({ merchantId: id })).refine(v => new Set(v.map(x => x.merchantId)).size === v.length),
  enterprise: enterpriseLinkConfig.optional(),
  enterpriseStore: enterpriseStoreConfig.optional(),
  runtime: z.object({ profile: z.string().min(1), provider: z.string().min(1), model: z.string().min(1), dshHome: z.string().min(1), processCwd: z.string().min(1), requestTimeoutMs: z.number().int().positive(), maxTokens: z.number().int().positive() }).optional(),
}).strict().refine(c => !c.enterpriseStore || Boolean(c.enterprise?.merchantId), 'Enterprise stores require a bound merchant')
let application: ReturnType<typeof handler> | undefined
/** Resolve deployment configuration at the first request.
 * @returns Initialized handler; invalid configuration fails without opening a public default.
 */
export function applicationHandler() {
  if (application) return application
  const config = configSchema.parse(JSON.parse(process.env.COMMERCE_CONFIG ?? JSON.stringify({ database: './data/commerce.sqlite', credentials: [], maxBodyBytes: 1048576, matchLimit: 3, shopify: [] })))
  const path = resolve(config.database); mkdirSync(dirname(path), { recursive: true })
  const service = new CommerceService(new CommerceDatabase(path), undefined, config.matchLimit)
  const childEnvironment: NodeJS.ProcessEnv = { NODE_ENV: 'production' }
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL']) if (process.env[key]) childEnvironment[key] = process.env[key]
  const enterprise = config.enterprise ? new EnterpriseLink(service, config.enterprise) : undefined
  const enterpriseStore = config.enterpriseStore && enterprise ? new EnterpriseStore(service, enterprise, config.enterpriseStore) : undefined
  const shopify = new ShopifyGateway(service, (merchantId, launchId) => {
    if (enterpriseStore && merchantId === enterprise?.config.merchantId) return enterpriseStore.resolve(merchantId, launchId)
    const connection = config.shopify.find(c => c.merchantId === merchantId)
    if (!connection) throw new BusinessError('shopify_not_connected', 503)
    const { merchantId: _merchantId, ...providerConfig } = connection
    return shopifyProvider(providerConfig)
  })
  const agent = config.runtime ? new AgentGateway(service, new DeepSeekRuntime({ ...config.runtime, env: childEnvironment }), merchantId => shopify.resolve(merchantId).readCatalog()) : undefined
  application = handler({ service, credentials: config.credentials, maxBodyBytes: config.maxBodyBytes, agent, shopify, enterprise, enterpriseStore })
  return application
}
