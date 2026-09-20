/** Next.js Node route delegates authorization and commands to the business API. */
import { applicationHandler } from '../../../src/server.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Handle authenticated business reads.
 * @param request - Incoming request.
 * @returns Role-scoped JSON.
 */
export async function GET(request: Request) { return applicationHandler()(request) }
/** Handle authenticated commands.
 * @param request - Incoming request.
 * @returns Command result or a safe error.
 */
export async function POST(request: Request) { return applicationHandler()(request) }
