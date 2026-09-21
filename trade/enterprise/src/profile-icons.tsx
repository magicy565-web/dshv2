/** Decorative profile symbols share a 24-unit grid and rounded 1.6-unit strokes. */
import type { ReactNode } from 'react'

const drawings = {
  company: <><path d="M4 21V5l9-2v18M13 9h7v12M2 21h20M8 7v1m0 4v1m0 4v1m9-5v1m0 3v1" /></>,
  overview: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  offering: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5V15" /></>,
  solution: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /><path d="M14 6h2a2 2 0 0 1 2 2v2m-2-2 2 2 2-2M10 18H8a2 2 0 0 1-2-2v-2m-2 2 2-2 2 2" /></>,
  capability: <><path d="M4 21V10l6 3V7l6 3V3h4v18H4ZM8 17h1m4 0h1m3 0h1" /></>,
  value_proposition: <><path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z" /><path d="M19 2v4m-2-2h4" /></>,
  case: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0M10 12v3h4v-3" /></>,
  partner_program: <><circle cx="8" cy="7" r="3" /><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 4 5v2" /></>,
  commercial_policy: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M8 13h8m-8 4h5" /></>,
  evidence: <><path d="m12 3 8 3v6c0 4-3 7-8 10-5-3-8-6-8-10V6l8-3Z" /><path d="M8 12h8m-8 4h5M8 8h4" /></>,
  sparkle: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4" /></>,
  arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
  arrowUp: <><path d="M6 18 18 6M6 6h12v12" /></>,
  chevron: <path d="m8 10 4 4 4-4" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  settings: <><path d="M4 7h6m4 0h6M4 17h10m4 0h2" /><circle cx="12" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  monitor: <><rect x="3" y="3" width="18" height="13" rx="3" /><path d="M8 21h8m-4-5v5M8 8l-2 2 2 2m8-4 2 2-2 2" /></>,
  link: <><path d="m9 15 6-6M8 16l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 8a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-1 1" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3 7 9 6 9-6" /></>,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  send: <path d="M21 3 10 14m11-11-7 18-4-7-7-4 18-7Z" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3.5v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8.5v.5" /></>,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  download: <path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" />,
} satisfies Record<string, ReactNode>

/** Names accepted by the profile's decorative icon component. */
export type ProfileIconName = keyof typeof drawings

/**
 * Render a decorative icon; the containing control owns its accessible name.
 * @param props - Icon name and rendered size in pixels.
 * @returns A non-focusable SVG using the current text color.
 */
export function ProfileIcon({ name, size = 20 }: { name: ProfileIconName; size?: number }) {
  return <svg className="sp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawings[name]}</svg>
}

/** Enterprise navigation mark shares the profile illustration style. @returns Decorative company icon. */
export function EnterpriseMark() { return <ProfileIcon name="company" size={18} /> }
/** Sites navigation mark identifies the browser destination. @returns Decorative globe icon. */
export function SitesMark() { return <ProfileIcon name="globe" size={18} /> }
/** Computer navigation mark identifies remote execution. @returns Decorative monitor icon. */
export function ComputersMark() { return <ProfileIcon name="monitor" size={18} /> }
