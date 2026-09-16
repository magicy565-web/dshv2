/** Deployment-configured enterprise SSO provider descriptors. */
import { z } from 'zod'

/** Supported provider families; credentials remain outside the repository. */
export const ssoProvider = z.enum(['wechat_work', 'feishu', 'dingtalk'])
/** OIDC-compatible configuration supplied by a private deployment. */
export const ssoConfig = z.object({
  provider: ssoProvider,
  issuer: z.url(),
  clientId: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1).max(100)).min(1),
}).strict()
export type SsoConfig = z.infer<typeof ssoConfig>

/** Validate deployment configuration without storing client secrets. */
export function parseSsoConfig(value: unknown): SsoConfig { return ssoConfig.parse(value) }
