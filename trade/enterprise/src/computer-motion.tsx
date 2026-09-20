/** Cloud-computer illustrations reflect reported jobs; the motion preview never performs remote actions. */
import { useEffect, useState } from 'react'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComputerBinding, ComputerJob } from './computer-schema.ts'
import type { computerConnection } from './computer-remote-schema.ts'
import type { z } from 'zod'

type Phase = 'idle' | 'connecting' | 'working' | 'human' | 'complete' | 'offline'
type T = PropsLocale<'computers'>['t']
const phases: readonly Phase[] = ['idle', 'connecting', 'working', 'human', 'complete', 'offline']
const titles = { idle: 'motionIdle', connecting: 'motionConnecting', working: 'motionWorking', human: 'motionHuman', complete: 'motionComplete', offline: 'motionOffline' } as const
const descriptions = { idle: 'motionIdleHelp', connecting: 'motionConnectingHelp', working: 'motionWorkingHelp', human: 'motionHumanHelp', complete: 'motionCompleteHelp', offline: 'motionOfflineHelp' } as const

function phaseOf(binding: ComputerBinding | undefined, job: ComputerJob | undefined): Phase {
  if (!binding) return 'idle'
  if (!binding.enabled) return 'offline'
  if (!job) return 'idle'
  switch (job.state) {
    case 'QUEUED': return 'idle'
    case 'RUNNING': return 'working'
    case 'WAITING_APPROVAL': case 'WAITING_HUMAN': case 'CANCEL_REQUESTED': case 'VERIFYING': return 'human'
    case 'SUCCEEDED': return 'complete'
    case 'PARTIAL': case 'FAILED': case 'CANCELLED': case 'UNKNOWN': return 'offline'
    default: return assertNever(job.state)
  }
}

/** Small decorative computer mark; the surrounding label supplies its accessible name.
 * @returns A scalable monitor glyph.
 */
export function ComputerGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M9 21h6m-3-4v4M7 8h4" strokeLinecap="round" /></svg>
}

function MetricGlyph({ kind }: { kind: 'fleet' | 'online' | 'running' | 'attention' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'fleet' ? <><rect x="3" y="4" width="18" height="13" rx="2.5" /><path d="M8 21h8m-4-4v4" /></> : kind === 'online' ? <><path d="M3 9a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0m-9 3a4 4 0 0 1 6 0" /><circle cx="12" cy="19" r="1" /></> : kind === 'running' ? <><path d="m13 3-9 11h7l-1 7 10-12h-7l1-6Z" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></>}
  </svg>
}

function Scene({ phase, t }: { phase: Phase; t: T }) {
  return <div className="cm-scene" data-phase={phase} aria-hidden="true">
    <div className="cm-grid" /><div className="cm-orbit cm-orbit-one" /><div className="cm-orbit cm-orbit-two" />
    <div className="cm-scene-top"><span><i />{t('motionCloud')}</span><span className="cm-scene-label">{t('motionIllustration')}</span></div>
    <div className="cm-machine">
      <div className="cm-window-back" />
      <div className="cm-window">
        <div className="cm-chrome"><span className="cm-traffic"><i /><i /><i /></span><span className="cm-address"><span>⌘</span> {t('motionWorkspace')}</span><span className="cm-window-plus">+</span></div>
        <div className="cm-window-content">
          <div className="cm-window-nav"><span className="cm-tiny-mark">✳</span><i /><i /><i /><i /></div>
          <div className="cm-document"><div className="cm-doc-heading"><span className="cm-doc-icon"><ComputerGlyph /></span><div><b>{t('motionDocument')}</b><span>{t(titles[phase])}</span></div><i className="cm-doc-check">✓</i></div>
            <div className="cm-skeleton"><i /><i /><i /></div>
            <div className="cm-doc-cards"><span><i /><i /><i /></span><span><i /><i /><i /></span></div>
            <div className="cm-document-footer"><span /><span /><span /></div>
          </div>
        </div>
        <div className="cm-scan" />
      </div>
      <div className="cm-cursor"><svg viewBox="0 0 28 32" fill="currentColor"><path d="m4 3 19 14-10 2-4 10Z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg><span>{t('motionAgent')}</span></div>
      <div className="cm-float-note"><span className="cm-note-symbol">{phase === 'complete' ? '✓' : phase === 'human' ? 'Ⅱ' : '✳'}</span><span>{t(titles[phase])}<i><b /><b /><b /></i></span></div>
    </div>
    <div className="cm-dock"><span className="cm-dock-active"><ComputerGlyph /></span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c5 5 5 11 0 16-5-5-5-11 0-16Z" /></svg></span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h6l2 3h8v10H4Z" strokeLinejoin="round" /></svg></span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 8 4 4-4 4m7 0h5" strokeLinecap="round" /></svg></span></div>
    <div className="cm-scene-bottom"><span>{t('motionIllustrationOnly')}</span><span className="cm-signal"><i /><i /><i /><i /></span></div>
  </div>
}

/** Summarize actual computer records and keep illustrative playback separate from operations.
 * @param props - Localized labels, fetched connection and task records, and workspace actions.
 * @returns Fleet metrics, an actionable task summary and an optional workflow illustration.
 */
export function ComputerExperience({ t, bindings, jobs, connections, loading, failed, onBind, onAssign, onOpenDesktop, onOpenJob }: {
  t: T; bindings: readonly ComputerBinding[]; jobs: readonly ComputerJob[]; loading: boolean; failed: boolean;
  connections: readonly z.infer<typeof computerConnection>[];
  onBind: () => void; onAssign: (binding: ComputerBinding) => void; onOpenDesktop: (binding: ComputerBinding) => void; onOpenJob: (job: ComputerJob) => void;
}) {
  const [preview, setPreview] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [selectedId, setSelectedId] = useState('')
  const binding = bindings.find(item => item.id === selectedId) ?? bindings[0]
  const job = binding ? jobs.filter(item => item.computerId === binding.id).at(-1) : undefined
  const attention = jobs.filter(item => ['WAITING_APPROVAL', 'WAITING_HUMAN', 'VERIFYING', 'UNKNOWN', 'CANCEL_REQUESTED'].includes(item.state))
  const nextJob = attention.at(-1)
  const stats = [
    { labelKey: 'fleetCount', value: bindings.length, hint: 'fleetCountHint', icon: 'fleet' },
    { labelKey: 'onlineCount', value: connections.filter(item => item.state === 'online').length, hint: 'onlineCountHint', icon: 'online' },
    { labelKey: 'runningCount', value: jobs.filter(item => item.state === 'RUNNING').length, hint: 'runningCountHint', icon: 'running' },
    { labelKey: 'attentionCount', value: attention.length, hint: 'attentionCountHint', icon: 'attention' },
  ] as const
  const shownPhase = preview ? phase : failed ? 'offline' : loading ? 'connecting' : phaseOf(binding, job)
  const recordTitle = failed ? t('error') : loading ? t('motionLoading') : job ? t(job.state) : binding ? t(binding.enabled ? 'motionNoWork' : 'disconnected') : t('motionWelcome')
  const title = preview ? t(titles[phase]) : recordTitle
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { setReduced(query.matches); if (query.matches) setPlaying(false) }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!preview || !playing || paused || reduced) return
    const timer = window.setTimeout(() => {
      const next = phases[phases.indexOf(phase) + 1]
      if (next) setPhase(next)
      else setPlaying(false)
    }, 2800)
    return () => window.clearTimeout(timer)
  }, [preview, phase, playing, paused, reduced])
  return <div className="cm-experience" data-motion-paused={paused || reduced}>
    <div className="cm-metrics" aria-label={t('motionOverview')}>{stats.map(stat => <div className="cm-metric" key={stat.labelKey}><div className="cm-metric-top"><span>{t(stat.labelKey)}</span><span className="cm-metric-symbol" data-kind={stat.icon}><MetricGlyph kind={stat.icon} /></span></div><strong>{loading || failed && !bindings.length ? '—' : stat.value}</strong><small>{t(stat.hint)}</small></div>)}</div>
    <div className="cm-operation-summary">
      <span className="cm-operation-icon" aria-hidden="true"><ComputerGlyph /></span>
      <div className="cm-operation-copy"><span className="cm-section-label">{t(!bindings.length ? 'setupLabel' : nextJob ? 'nextAction' : 'motionRecorded')}</span><h2>{nextJob ? t(nextJob.state) : recordTitle}</h2><p>{nextJob ? nextJob.objective : job ? job.objective : binding ? t('motionNoWorkHelp') : t('motionWelcomeHelp')}</p>
        {!!bindings.length && <span className="cm-record-note">{t('motionSnapshotCaption')}</span>}
      </div>
      <div className="cm-operation-actions">{bindings.length > 1 && !nextJob && <select className="cm-select" aria-label={t('motionSelectComputer')} value={binding?.id} onChange={event => setSelectedId(event.target.value)}>{bindings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <button type="button" className="cm-primary" disabled={loading || failed || !nextJob && !!binding && !binding.enabled} onClick={() => nextJob ? onOpenJob(nextJob) : binding ? onAssign(binding) : onBind()}>{t(nextJob ? 'details' : binding ? 'create' : 'motionFirstComputer')}<span aria-hidden="true">→</span></button>
        {binding && <button type="button" className="cm-text-button" onClick={() => onOpenDesktop(binding)}>{t('desktopTitle')}</button>}
      </div>
      {!bindings.length && !loading && !failed && <ol className="cm-onboarding"><li><span>1</span><div><b>{t('setupBind')}</b><small>{t('setupBindHelp')}</small></div></li><li><span>2</span><div><b>{t('setupConnect')}</b><small>{t('setupConnectHelp')}</small></div></li><li><span>3</span><div><b>{t('setupAssign')}</b><small>{t('setupAssignHelp')}</small></div></li></ol>}
    </div>
    <div className="cm-stage-toolbar"><div className="cm-stage-tabs"><button type="button" aria-pressed={!preview} onClick={() => { setPreview(false); setPlaying(false) }}>{t('motionOverview')}</button><button type="button" aria-pressed={preview} aria-expanded={preview} aria-controls="cm-workflow-preview" onClick={() => { setPreview(!preview); setPhase('idle'); setPlaying(false) }}>{t('motionPreview')}<span aria-hidden="true">{preview ? '−' : '+'}</span></button></div>{preview && <button type="button" className="cm-text-button" aria-pressed={paused || reduced} disabled={reduced} onClick={() => { setPaused(!paused); setPlaying(false) }}>{t(reduced ? 'motionReduced' : paused ? 'motionResume' : 'motionPause')}</button>}</div>
    <div id="cm-workflow-preview" className="cm-illustration-panel" hidden={!preview}>
    <div className="cm-stage" data-preview={preview}>
      <Scene phase={shownPhase} t={t} />
      <div className="cm-summary"><div className="cm-summary-meta"><span className="cm-pill">{t(preview ? 'motionDemoBadge' : 'motionRecorded')}</span><span className="cm-phase-dot" data-phase={shownPhase} /></div>
        {!preview && bindings.length > 1 && <select className="cm-select" aria-label={t('motionSelectComputer')} value={binding?.id} onChange={event => setSelectedId(event.target.value)}>{bindings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <div className="cm-summary-copy" key={`${preview}-${title}`} role="status" aria-live={playing ? 'off' : 'polite'}><h3>{title}</h3><p>{preview ? t(descriptions[phase]) : job ? job.objective : binding ? t('motionNoWorkHelp') : t('motionWelcomeHelp')}</p></div>
        <ol className="cm-steps"><li data-active={shownPhase === 'idle' || shownPhase === 'connecting'}><span>01</span><div><b>{t('motionStepOne')}</b><small>{t('motionStepOneHelp')}</small></div></li><li data-active={shownPhase === 'working' || shownPhase === 'human'}><span>02</span><div><b>{t('motionStepTwo')}</b><small>{t('motionStepTwoHelp')}</small></div></li><li data-active={shownPhase === 'complete'}><span>03</span><div><b>{t('motionStepThree')}</b><small>{t('motionStepThreeHelp')}</small></div></li></ol>
        {preview ? <p className="cm-preview-disclaimer">{t('motionDemoHelp')}</p> : <button type="button" className="cm-primary" disabled={loading || failed || !!binding && !binding.enabled} onClick={() => binding ? onAssign(binding) : onBind()}>{t(binding ? 'create' : 'motionFirstComputer')}<span aria-hidden="true">↗</span></button>}
      </div>
    </div>
    {preview && <div className="cm-preview-controls"><div className="cm-phase-buttons" role="group" aria-label={t('motionStates')}>{phases.map((item, index) => <button type="button" key={item} aria-pressed={phase === item} onClick={() => { setPhase(item); setPlaying(false) }}><span>{String(index + 1).padStart(2, '0')}</span>{t(titles[item])}</button>)}</div><button type="button" className="cm-play" disabled={reduced} aria-pressed={playing} onClick={() => { if (!playing) { setPhase('idle'); setPaused(false) }; setPlaying(!playing) }}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span>{t(playing ? 'motionStopPlayback' : 'motionPlay')}</button></div>}
    <div className="cm-caption"><span><i />{t('motionDemoCaption')}</span><span>{t('motionCaption')}</span></div>
    </div>
  </div>
}
