/** Browser-safe business projections, independent of database and runtime implementations. */
import type { Fact, Id, Records } from './schema.ts'
import type { readiness } from './readiness.ts'

interface SharedView { subjectId: Id; samples: Records['sample'][]; activity: Records['activity'][] }
/** Factory and merchant views expose only records owned or disclosed to that principal. */
export type WorkspaceView = SharedView & ({
  role: 'factory'
  company: Records['company'] | null
  products: (Records['product'] & { passport: Records['passport']; readiness: ReturnType<typeof readiness> })[]
  opportunities: Records['opportunity'][]
  evidence: Records['evidence'][]
} | {
  role: 'merchant'
  merchant: Records['merchant'] | null
  profile: Records['merchantProfile'] | null
  matches: (Records['match'] & { opportunity: Records['opportunity']; facts: Record<string, Fact> })[]
  launches: Records['launch'][]
  listings: Records['listing'][]
  artifacts: Records['artifact'][]
  approvals: Records['approval'][]
  performance: Records['performance'][]
})
