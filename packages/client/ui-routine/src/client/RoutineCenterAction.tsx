import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { IconAlarmClockOutline16, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { NS } from './locales.ts'
import css from './RoutineCenterAction.module.css'

export interface RoutineView { readonly id: string; readonly name: string; readonly prompt: string; readonly schedule: { readonly kind: 'once' | 'interval'; readonly scheduledAt?: string; readonly everySeconds?: number }; readonly nextRunAt?: string; readonly status: 'active' | 'deleted'; readonly lastRun?: { readonly status: string; readonly finishedAt?: string; readonly sessionId?: string } }
export interface RoutineProjection {
  readonly routines: readonly RoutineView[]
  readonly runs: readonly {
    readonly routineId: string
    readonly status: string
    readonly finishedAt?: string
    readonly sessionId?: string
  }[]
}

declare module '@deepseek-ai/dsh-session-projection/types' { interface SessionProjectionMap { routine: RoutineProjection } }
type Props = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<typeof NS>
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

function localTime(value: string | undefined): string { return value === undefined ? '' : new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(value)) }
function statusClass(status: string): string { return status === 'running' ? (css.dotRunning ?? css.dot ?? '') : status === 'failed' ? (css.dotFailed ?? css.dot ?? '') : (css.dot ?? '') }

/** Session-header Routine Center backed by the durable routine projection. */
export function RoutineCenterAction({ useProjection, t }: Props) {
  const projection = useProjection('routine')
  const records = projection?.routines.filter(item => item.status === 'active') ?? []
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const position = useAnchoredPosition({ open, anchorRef: triggerRef, panelRef, side: 'bottom', gap: 6, margin: 12 })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
  useEffect(() => { if (records.length === 0 && open) setOpen(false) }, [records.length, open])
  const lastRuns = useMemo(() => new Map((projection?.runs ?? []).map(run => [run.routineId, run])), [projection?.runs])
  if (records.length === 0) return null
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => { if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); triggerRef.current?.focus() } }
  return <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
    <button ref={triggerRef} type="button" className={css.trigger} aria-expanded={open} aria-label={t('aria')} onClick={() =>{  setOpen((value: boolean) => !value) }}><IconAlarmClockOutline16 size={14} /><span>{t('trigger')}</span></button>
    {open ? createPortal(<div ref={panelRef} className={css.panel} style={position ?? MEASURE_STYLE} role="dialog" aria-label={t('aria')}>
      <div className={css.heading}><div><h2 className={css.title}>{t('panel.title')}</h2><p className={css.subtitle}>{t('panel.subtitle')}</p></div><button type="button" className={css.create}>{t('create')}</button></div>
      <ul className={css.list}>{records.map((record) => { const run = lastRuns.get(record.id); const status = run?.status ?? 'active'; return <li key={record.id} className={css.row}><div className={css.rowTop}><span className={statusClass(status)} aria-hidden="true" /><span className={css.name}>{record.name}</span><span className={css.status}>{t(`status.${status}` as never) || status}</span></div><div className={css.prompt}>{record.prompt}</div><div className={css.meta}><span>{record.schedule.kind === 'once' ? t('schedule.once') : t('schedule.interval', { seconds: record.schedule.everySeconds ?? 0 })}</span>{record.nextRunAt ? <><span aria-hidden="true">·</span><span>{t('nextRun', { time: localTime(record.nextRunAt) })}</span></> : null}{run?.finishedAt ? <><span aria-hidden="true">·</span><span>{t('lastRun', { time: localTime(run.finishedAt) })}</span></> : null}</div><div className={css.actions}><button type="button" className={css.action}>{t('runNow')}</button>{run?.sessionId ? <button type="button" className={css.action}>{t('openSession')}</button> : null}</div></li> })}</ul>
    </div>, document.body) : null}
  </div>
}
