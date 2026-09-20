/** Independent product shell; no Harness Web UI imports. */
import type { ReactNode } from 'react'
import './style.css'
export const metadata = { title: 'Commerce Workspace', description: 'Source-backed product opportunities for independent brands.' }
/** Render the product document.
 * @param props - App content.
 * @returns Root document.
 */
export default function Layout({ children }: { children: ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html> }
