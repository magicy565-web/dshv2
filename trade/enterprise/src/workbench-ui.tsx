/** Workbench component language: one filled hero surface per screen, open ledger rows, a decision queue and an outcome rail. Components are presentational; pages own copy and data. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ProfileIcon, type ProfileIconName } from './profile-icons.tsx'

/** Two-letter actor mark: initials for Latin names, the first two characters for CJK. */
function actorMark(label: string): string {
  const compact = label.trim().replace(/\s+/g, ' ')
  if (!compact) return '—'
  if (/[一-鿿]/.test(compact)) return [...compact.replace(/\s/g, '')].slice(0, 2).join('')
  return compact.split(' ').slice(0, 2).map(word => word[0]!.toUpperCase()).join('')
}

/**
 * The screen's single filled surface: an ink-toned panel carrying the page's primary object.
 * @param props - `status` drives the paused/achieved presentation; `label` names the region; `children` compose HeroMain/HeroCount.
 * @returns The hero panel element.
 */
export function Hero({ status, label, children }: { status?: string; label: string; children: ReactNode }) {
  return <section className="wb-goal" data-status={status} aria-label={label}>{children}</section>
}

/**
 * Primary column of the hero panel.
 * @param props - HeroMeta, HeroTitle, HeroLede, HeroFacts and Meter content.
 * @returns The hero's main column.
 */
export function HeroMain({ children }: { children: ReactNode }) {
  return <div className="wb-goal-main">{children}</div>
}

/**
 * Eyebrow row of the hero: category label, status chip and an optional trailing action.
 * @param props - Eyebrow, Chip and TextLink content.
 * @returns The hero meta row.
 */
export function HeroMeta({ children }: { children: ReactNode }) {
  return <div className="wb-goal-eyebrow">{children}</div>
}

/**
 * Display-size title of the hero's object.
 * @param props - Title text.
 * @returns The hero title.
 */
export function HeroTitle({ children }: { children: ReactNode }) {
  return <h2 className="wb-goal-title">{children}</h2>
}

/**
 * Secondary lede under the hero title, clamped to two lines.
 * @param props - Lede text.
 * @returns The hero lede paragraph.
 */
export function HeroLede({ children }: { children: ReactNode }) {
  return <p className="wb-goal-criteria">{children}</p>
}

/**
 * Factual context row under the lede; each fact is a span.
 * @param props - Fact spans.
 * @returns The hero facts row.
 */
export function HeroFacts({ children }: { children: ReactNode }) {
  return <div className="wb-goal-facts">{children}</div>
}

/**
 * Large tabular numeral anchoring the hero's trailing edge, with a short caption.
 * @param props - `value` is the displayed numeral; `caption` qualifies it.
 * @returns The hero count block, hidden from assistive technology because the facts row carries the same fact.
 */
export function HeroCount({ value, caption }: { value: ReactNode; caption: string }) {
  return <div className="wb-goal-count" aria-hidden="true"><strong>{value}</strong><span>{caption}</span></div>
}

/**
 * Thin progress track with a label row, used inside the hero.
 * @param props - `percent` fills the track; `label` names the meter.
 * @returns The meter block, decorative to assistive technology.
 */
export function Meter({ percent, label }: { percent: number; label: string }) {
  return <div className="wb-goal-time" aria-hidden="true">
    <div className="wb-goal-track"><span style={{ width: `${percent}%` }} /></div>
    <div className="wb-goal-time-label"><span>{label}</span><span>{percent}%</span></div>
  </div>
}

/**
 * Small caps category label.
 * @param props - Label text.
 * @returns The eyebrow element.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="wb-eyebrow">{children}</span>
}

/**
 * Rounded status chip; `status` selects the tone.
 * @param props - `status` is one of active/paused/achieved; `children` is the label.
 * @returns The chip element.
 */
export function Chip({ status, children }: { status: string; children: ReactNode }) {
  return <span className="wb-chip" data-status={status}>{children}</span>
}

/**
 * Section with a baseline-aligned head: title, optional note and optional count pill.
 * @param props - `label` names the region; `complementary` renders an aside for secondary rails; `className` adds layout classes.
 * @returns The section element with its head and content.
 */
export function Section({ label, title, note, count, countTone, complementary, className, children }: { label: string; title: string; note?: string; count?: number; countTone?: 'warn'; complementary?: boolean; className?: string; children: ReactNode }) {
  const Tag = complementary ? 'aside' : 'section'
  return <Tag className={className ?? (complementary ? 'wb-side' : undefined)} aria-label={label}>
    <div className="wb-head"><h2>{title}</h2>{note && <span className="wb-head-note">{note}</span>}{count !== undefined && count > 0 && <span className="wb-count" data-tone={countTone}>{count}</span>}</div>
    {children}
  </Tag>
}

/**
 * Compact banner inside the hero for a missing primary object: eyebrow, title and one action.
 * @param props - `children` carries the action.
 * @returns The hero banner.
 */
export function HeroBanner({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="wb-goal-empty">
    <div><Eyebrow>{eyebrow}</Eyebrow><h2>{title}</h2></div>
    {children}
  </div>
}

/**
 * Quiet one-line reassurance in place of an empty queue.
 * @param props - Line text.
 * @returns The quiet paragraph.
 */
export function Quiet({ children }: { children: ReactNode }) {
  return <p className="wb-quiet">{children}</p>
}

/**
 * Empty block for a ledger section: statement, hint and text-link actions.
 * @param props - `children` carries the TextLink actions.
 * @returns The empty block.
 */
export function BlockEmpty({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <div className="wb-stream-empty">
    <p>{title}</p>
    <p className="wb-hint">{hint}</p>
    <div className="wb-links">{children}</div>
  </div>
}

/**
 * Hairline-divided row list.
 * @param props - Row elements wrapped in list items.
 * @returns The list element.
 */
export function RowList({ children }: { children: ReactNode }) {
  return <ul className="wb-list">{children}</ul>
}

/**
 * One ledger row: leading mark, title, optional status pill, relative time and a meta line; the whole row activates.
 * @param props - `leading` is an ActorMark or Dot; `onActivate` fires on row activation.
 * @returns The row list item.
 */
export function Row({ leading, title, pill, time, meta, onActivate }: { leading: ReactNode; title: string; pill?: string; time: string; meta: string; onActivate: () => void }) {
  return <li>
    <button type="button" className="wb-row" onClick={onActivate}>
      <span className="wb-row-top">
        {leading}
        <strong>{title}</strong>
        {pill && <span className="wb-pill">{pill}</span>}
        <span className="wb-time">{time}</span>
        <span className="wb-row-arrow"><ProfileIcon name="arrow" size={15} /></span>
      </span>
      <span className="wb-row-meta">{meta}</span>
    </button>
  </li>
}

/**
 * Square monogram tile identifying an actor; `pulse` adds the working-state ring.
 * @param props - `label` is the actor name the mark derives from; `pulse` marks live work.
 * @returns The actor mark tile.
 */
export function ActorMark({ label, pulse }: { label: string; pulse?: boolean }) {
  return <span className="wb-actor" data-pulse={pulse || undefined}>{actorMark(label)}</span>
}

/**
 * Small state dot for compact queues.
 * @param props - `tone` selects work/warn/done/muted.
 * @returns The dot element.
 */
export function Dot({ tone }: { tone: 'work' | 'warn' | 'done' | 'muted' }) {
  return <span className="wb-dot" data-tone={tone} />
}

/**
 * Inline text action with a directional arrow that slides on hover.
 * @param props - `onActivate` fires on activation; `end` pins the link to the row's trailing edge.
 * @returns The text link button.
 */
export function TextLink({ onActivate, end, children }: { onActivate: () => void; end?: boolean; children: ReactNode }) {
  return <button type="button" className={end ? 'wb-text-link wb-goal-link' : 'wb-text-link'} onClick={onActivate}>{children}<ProfileIcon name="arrow" size={14} /></button>
}

/**
 * Vertical outcome rail.
 * @param props - TimelineEvent items.
 * @returns The ordered timeline element.
 */
export function Timeline({ children }: { children: ReactNode }) {
  return <ol className="wb-timeline">{children}</ol>
}

/**
 * One outcome on the rail: time, kind chip, title and an optional detail excerpt; the whole event activates.
 * @param props - `onActivate` fires on activation.
 * @returns The timeline event.
 */
export function TimelineEvent({ time, kind, title, detail, onActivate }: { time: string; kind: string; title: string; detail?: string | undefined; onActivate: () => void }) {
  return <li className="wb-event">
    <button type="button" onClick={onActivate}>
      <span className="wb-event-time">{time}</span>
      <span className="wb-event-body">
        <span className="wb-event-kind">{kind}</span>
        <strong>{title}</strong>
        {detail && <span className="wb-event-detail">{detail}</span>}
      </span>
    </button>
  </li>
}

/**
 * First-run hero: the same filled surface carrying a single primary action.
 * @param props - Eyebrow, title and hint copy; `children` carries the actions.
 * @returns The empty-state hero.
 */
export function EmptyHero({ eyebrow, title, hint, children }: { eyebrow: string; title: string; hint: string; children: ReactNode }) {
  return <div className="wb-start">
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2>{title}</h2>
    <p>{hint}</p>
    <div className="wb-start-actions">{children}</div>
  </div>
}

/** Unit labels for countdown segments; supplied by the page's locale. */
export interface CountdownLabels { day: string; hour: string; minute: string; second: string }

/**
 * Break a remaining duration into one or two display segments: days when far, hours+minutes within two days, minutes+seconds within the hour.
 * @param ms - Remaining milliseconds; negative values clamp to zero.
 * @param labels - Localized unit labels.
 * @returns One or two value/unit segments in display order.
 */
export function formatRemaining(ms: number, labels: CountdownLabels): Array<{ value: string; unit: string }> {
  const rest = Math.max(0, ms)
  const minutes = Math.floor(rest / 60000)
  if (rest >= 48 * 3600000) return [{ value: String(Math.round(rest / 86400000)), unit: labels.day }]
  if (rest >= 3600000) return [{ value: String(Math.floor(rest / 3600000)), unit: labels.hour }, { value: String(minutes % 60).padStart(2, '0'), unit: labels.minute }]
  return [{ value: String(minutes).padStart(2, '0'), unit: labels.minute }, { value: String(Math.floor(rest / 1000) % 60).padStart(2, '0'), unit: labels.second }]
}

/**
 * Format an elapsed duration as mm:ss, or h:mm:ss beyond one hour.
 * @param ms - Elapsed milliseconds; negative values clamp to zero.
 * @returns The clock-face string.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours ? `${hours}:${tail}` : tail
}

/** Tick once per second while `tick` is set; inert during server rendering. */
function useSecond(tick: boolean | undefined): void {
  const [, beat] = useState(0)
  useEffect(() => {
    if (!tick) return
    const timer = setInterval(() => beat(n => n + 1), 1000)
    return () => clearInterval(timer)
  }, [tick])
}

/**
 * Live countdown to a deadline with distance-appropriate granularity; `tick` enables per-second updates.
 * @param props - `to` is the deadline ISO time; `now` pins the reference instant for static renders.
 * @returns The countdown segments in tabular numerals.
 */
export function Countdown({ to, labels, now, tick }: { to: string; labels: CountdownLabels; now?: number | undefined; tick?: boolean }) {
  useSecond(tick)
  const segments = formatRemaining(new Date(to).getTime() - (now ?? Date.now()), labels)
  return <span className="wb-countdown">{segments.map(segment => <span key={segment.unit} className="wb-countdown-seg"><strong>{segment.value}</strong><span>{segment.unit}</span></span>)}</span>
}

/**
 * Live timer for work in flight; `tick` enables per-second updates.
 * @param props - `since` is the start ISO time; `now` pins the reference instant for static renders.
 * @returns The elapsed clock with a pulsing dot.
 */
export function Elapsed({ since, now, tick }: { since: string; now?: number | undefined; tick?: boolean }) {
  useSecond(tick)
  return <span className="wb-elapsed"><span className="wb-elapsed-dot" />{formatElapsed((now ?? Date.now()) - new Date(since).getTime())}</span>
}

/**
 * Thin progress bar with an optional label row.
 * @param props - `value` is 0–100; `tone` selects accent/success/warn.
 * @returns The progress bar.
 */
export function ProgressBar({ value, label, tone }: { value: number; label?: string; tone?: 'accent' | 'success' | 'warn' }) {
  const percent = Math.min(100, Math.max(0, Math.round(value)))
  return <div className="wb-progress" data-tone={tone}>
    {label && <div className="wb-progress-head"><span>{label}</span><span>{percent}%</span></div>}
    <div className="wb-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
  </div>
}

/**
 * Circular progress ring with an optional center value.
 * @param props - `value` is 0–100; `size` is the outer diameter in pixels.
 * @returns The progress ring.
 */
export function ProgressRing({ value, size = 32, showValue }: { value: number; size?: number; showValue?: boolean }) {
  const percent = Math.min(100, Math.max(0, Math.round(value)))
  const stroke = 3
  const radius = (size - stroke) / 2
  const length = 2 * Math.PI * radius
  return <span className="wb-ring" style={{ width: size, height: size }} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
    <svg width={size} height={size}>
      <circle className="wb-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
      <circle className="wb-ring-fill" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} strokeDasharray={length} strokeDashoffset={length * (1 - percent / 100)} />
    </svg>
    {showValue && <span className="wb-ring-value">{percent}</span>}
  </span>
}

/**
 * Segmented progress: one block per unit of work, filled up to `done`.
 * @param props - `done` completed units; `total` all units; `label` an optional trailing caption.
 * @returns The segmented steps row.
 */
export function Steps({ done, total, label }: { done: number; total: number; label?: string }) {
  return <span className="wb-steps">
    {Array.from({ length: total }, (_, index) => <span key={index} className="wb-steps-seg" data-done={index < done || undefined} />)}
    {label && <span className="wb-steps-label">{label}</span>}
  </span>
}

/** Linear-style status glyph set. */
export type StatusIconName = 'backlog' | 'todo' | 'inprogress' | 'done' | 'blocked' | 'canceled'

/**
 * Status glyph: dashed backlog, hollow todo, pie-filled in-progress, checked done, barred blocked, crossed canceled.
 * @param props - `status` selects the glyph; `progress` sets the in-progress pie (0–100); `size` is the diameter in pixels.
 * @returns The status icon.
 */
export function StatusIcon({ status, progress = 50, size = 14 }: { status: StatusIconName; progress?: number; size?: number }) {
  const center = size / 2
  const radius = center - 1.2
  const angle = (Math.min(100, Math.max(0, progress)) / 100) * 360
  const large = angle > 180 ? 1 : 0
  const x = center + radius * Math.sin((angle * Math.PI) / 180)
  const y = center - radius * Math.cos((angle * Math.PI) / 180)
  return <svg className="wb-status" data-status={status} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    {status === 'backlog' && <circle cx={center} cy={center} r={radius} className="wb-status-line" strokeDasharray="2.2 2.2" />}
    {status === 'todo' && <circle cx={center} cy={center} r={radius} className="wb-status-line" />}
    {status === 'inprogress' && <>
      <circle cx={center} cy={center} r={radius} className="wb-status-line wb-status-accent" />
      {angle > 0 && <path className="wb-status-pie" d={`M ${center} ${center} L ${center} ${center - radius} A ${radius} ${radius} 0 ${large} 1 ${x} ${y} Z`} />}
    </>}
    {status === 'done' && <><circle cx={center} cy={center} r={radius + .6} className="wb-status-solid" /><path className="wb-status-mark" d={`M ${center - 3.4} ${center + .2} l 2.3 2.4 4.4 -4.8`} /></>}
    {status === 'blocked' && <><circle cx={center} cy={center} r={radius} className="wb-status-line wb-status-warn" /><path className="wb-status-mark wb-status-warn-stroke" d={`M ${center - 2.6} ${center} h 5.2`} /></>}
    {status === 'canceled' && <><circle cx={center} cy={center} r={radius + .6} className="wb-status-muted" /><path className="wb-status-mark" d={`M ${center - 2.4} ${center - 2.4} l 4.8 4.8 m 0 -4.8 l -4.8 4.8`} /></>}
  </svg>
}

/**
 * Priority indicator: three ascending bars filled by level, or an urgent mark at level 4.
 * @param props - `level` is 0 (none) through 4 (urgent); `label` provides the accessible name.
 * @returns The priority glyph.
 */
export function PriorityBars({ level, label }: { level: 0 | 1 | 2 | 3 | 4; label?: string }) {
  if (level === 4) return <span className="wb-priority" data-level={level} role="img" aria-label={label}><span className="wb-priority-urgent">!</span></span>
  return <span className="wb-priority" data-level={level} role="img" aria-label={label}>
    {[0, 1, 2].map(index => <span key={index} className="wb-priority-bar" data-on={index < level || undefined} />)}
  </span>
}

/**
 * Tinted label badge with an optional dot.
 * @param props - `tone` selects the tint; `dot` prepends a tone dot.
 * @returns The badge.
 */
export function Badge({ tone = 'gray', dot, children }: { tone?: 'blue' | 'amber' | 'green' | 'red' | 'gray'; dot?: boolean; children: ReactNode }) {
  return <span className="wb-badge" data-tone={tone}>{dot && <span className="wb-badge-dot" />}{children}</span>
}

/** Stable hue for an actor's avatar, derived from the name. */
function avatarHue(name: string): number {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 360
  return hash
}

/**
 * Round avatar with the actor's mark over a name-derived gradient.
 * @param props - `label` is the actor name; `size` is the diameter in pixels.
 * @returns The avatar.
 */
export function Avatar({ label, size = 24 }: { label: string; size?: number }) {
  const hue = avatarHue(label || '?')
  const style: CSSProperties = { width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${(hue + 42) % 360} 58% 40%))` }
  return <span className="wb-avatar" style={style}>{actorMark(label)}</span>
}

/**
 * Overlapping avatar row; later avatars stack behind earlier ones.
 * @param props - `labels` are actor names in stack order; `size` is each diameter.
 * @returns The avatar stack.
 */
export function AvatarStack({ labels, size = 24 }: { labels: string[]; size?: number }) {
  return <span className="wb-avatar-stack">{labels.map(label => <Avatar key={label} label={label} size={size} />)}</span>
}

/**
 * Keyboard key cap.
 * @param props - Key label.
 * @returns The kbd element.
 */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="wb-kbd">{children}</kbd>
}

/**
 * Hover tooltip bubble above its trigger.
 * @param props - `tip` is the bubble text; `children` is the trigger.
 * @returns The tooltip wrapper.
 */
export function Tooltip({ tip, children }: { tip: string; children: ReactNode }) {
  return <span className="wb-tip" data-tip={tip}>{children}</span>
}

/**
 * Toggle switch.
 * @param props - `checked` is the state; `onToggle` receives the next state; `label` is the accessible name.
 * @returns The switch button.
 */
export function Switch({ checked, onToggle, label }: { checked: boolean; onToggle: (next: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="wb-switch" onClick={() => onToggle(!checked)}><span className="wb-switch-knob" /></button>
}

/**
 * Segmented control for switching between two to four mutually exclusive views.
 * @param props - `options` are value/label pairs; `value` is active; `onChange` fires with the chosen value; `label` names the group.
 * @returns The segmented control.
 */
export function Segmented({ options, value, onChange, label }: { options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="wb-segmented" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" data-active={option.value === value || undefined} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

/**
 * Square ghost button carrying a single icon.
 * @param props - `icon` is the glyph name; `label` is the accessible name; `onActivate` fires on activation.
 * @returns The icon button.
 */
export function IconButton({ icon, label, onActivate }: { icon: ProfileIconName; label: string; onActivate: () => void }) {
  return <button type="button" className="wb-icon-button" aria-label={label} onClick={onActivate}><ProfileIcon name={icon} size={16} /></button>
}

/**
 * Dropdown menu panel.
 * @param props - MenuItem and MenuDivider children; `label` names the menu.
 * @returns The menu panel.
 */
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  return <div className="wb-menu" role="menu" aria-label={label}>{children}</div>
}

/**
 * One menu entry: optional icon, label, trailing hint or key cap.
 * @param props - `danger` tones destructive entries; `onActivate` fires on selection.
 * @returns The menu item.
 */
export function MenuItem({ icon, label, hint, danger, onActivate }: { icon?: ProfileIconName; label: string; hint?: string; danger?: boolean; onActivate: () => void }) {
  return <button type="button" role="menuitem" className="wb-menu-item" data-danger={danger || undefined} onClick={onActivate}>
    {icon && <ProfileIcon name={icon} size={15} />}
    <span>{label}</span>
    {hint && <span className="wb-menu-hint">{hint}</span>}
  </button>
}

/**
 * Divider between menu groups.
 * @returns The menu divider.
 */
export function MenuDivider() {
  return <div className="wb-menu-divider" role="separator" />
}

/**
 * Shimmer placeholder bars while content loads.
 * @param props - `widths` sets each bar's width; defaults to three bars.
 * @returns The skeleton block.
 */
export function Skeleton({ widths = ['62%', '88%', '41%'] }: { widths?: string[] }) {
  return <div className="wb-skeleton" aria-hidden="true">{widths.map((width, index) => <span key={index} style={{ width }} />)}</div>
}

/**
 * Labeled text field with the workbench focus ring.
 * @param props - `label` names the field; `hint` shows below; `onChange` receives the next value.
 * @returns The field wrapper.
 */
export function TextField({ label, value, placeholder, hint, onChange }: { label: string; value: string; placeholder?: string; hint?: string; onChange: (value: string) => void }) {
  return <label className="wb-field">
    <span className="wb-field-label">{label}</span>
    <input className="wb-input" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    {hint && <span className="wb-field-hint">{hint}</span>}
  </label>
}

/** Button visual tone. */
export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger'

/**
 * Action button with tone, size and loading state.
 * @param props - `tone` selects the visual weight; `loading` swaps in a spinner and blocks activation.
 * @returns The button.
 */
export function Button({ tone = 'primary', size = 'md', loading, disabled, onActivate, children }: { tone?: ButtonTone; size?: 'sm' | 'md'; loading?: boolean; disabled?: boolean; onActivate: () => void; children: ReactNode }) {
  return <button type="button" className="wb-button" data-tone={tone} data-size={size} disabled={disabled || loading} onClick={onActivate}>
    {loading && <span className="wb-button-spin" aria-hidden="true" />}
    {children}
  </button>
}

/**
 * Attached button row for related actions.
 * @param props - Button children.
 * @returns The button group.
 */
export function ButtonGroup({ children }: { children: ReactNode }) {
  return <div className="wb-button-group">{children}</div>
}

/**
 * Primary action with an attached menu trigger.
 * @param props - `label` is the main action; `menuLabel` names the caret trigger; `onMenu` opens the attached menu.
 * @returns The split button.
 */
export function SplitButton({ label, menuLabel, onActivate, onMenu }: { label: string; menuLabel: string; onActivate: () => void; onMenu: () => void }) {
  return <div className="wb-split">
    <button type="button" className="wb-split-main" onClick={onActivate}>{label}</button>
    <button type="button" className="wb-split-caret" aria-label={menuLabel} onClick={onMenu}><ProfileIcon name="chevron" size={13} /></button>
  </div>
}

/**
 * Copy-to-clipboard button with transient done feedback.
 * @param props - `text` is copied; `label`/`doneLabel` are the two states.
 * @returns The copy button.
 */
export function CopyButton({ text, label, doneLabel }: { text: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" className="wb-copy" data-done={done || undefined} onClick={() => {
    void navigator.clipboard?.writeText(text)
    setDone(true)
    setTimeout(() => setDone(false), 1600)
  }}>
    <ProfileIcon name={done ? 'check' : 'copy'} size={14} />
    {done ? doneLabel : label}
  </button>
}

/**
 * Selection action bar: count of selected items plus bulk actions.
 * @param props - `countLabel` is the formatted selection count; `onClear` exits selection; `children` carries the bulk actions.
 * @returns The action bar.
 */
export function ActionBar({ countLabel, clearLabel, onClear, children }: { countLabel: string; clearLabel: string; onClear: () => void; children: ReactNode }) {
  return <div className="wb-action-bar" role="toolbar" aria-label={countLabel}>
    <span className="wb-action-count">{countLabel}</span>
    {children}
    <button type="button" className="wb-action-clear" aria-label={clearLabel} onClick={onClear}><ProfileIcon name="x" size={14} /></button>
  </div>
}

/**
 * Multiline text field.
 * @param props - `rows` sets the visible height; `onChange` receives the next value.
 * @returns The textarea field.
 */
export function TextArea({ label, value, placeholder, rows = 3, hint, onChange }: { label: string; value: string; placeholder?: string; rows?: number; hint?: string; onChange: (value: string) => void }) {
  return <label className="wb-field">
    <span className="wb-field-label">{label}</span>
    <textarea className="wb-input wb-textarea" rows={rows} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    {hint && <span className="wb-field-hint">{hint}</span>}
  </label>
}

/**
 * Search field with leading icon, optional shortcut cap and clear button.
 * @param props - `shortcut` renders a key cap; `onClear` resets the value.
 * @returns The search field.
 */
export function SearchInput({ value, placeholder, shortcut, clearLabel, onChange, onClear }: { value: string; placeholder?: string; shortcut?: string; clearLabel: string; onChange: (value: string) => void; onClear: () => void }) {
  return <div className="wb-search">
    <ProfileIcon name="search" size={15} />
    <input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    {value && <button type="button" className="wb-search-clear" aria-label={clearLabel} onClick={onClear}><ProfileIcon name="x" size={13} /></button>}
    {!value && shortcut && <Kbd>{shortcut}</Kbd>}
  </div>
}

/**
 * Numeric field with stepper buttons.
 * @param props - `min`/`max` clamp; `onChange` receives the next number.
 * @returns The number input.
 */
export function NumberInput({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))
  return <label className="wb-field">
    <span className="wb-field-label">{label}</span>
    <span className="wb-number">
      <input className="wb-input" type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(clamp(Number(event.target.value)))} />
      <span className="wb-number-steps">
        <button type="button" aria-label="+" onClick={() => onChange(clamp(value + step))}><ProfileIcon name="chevron" size={11} /></button>
        <button type="button" aria-label="-" onClick={() => onChange(clamp(value - step))}><ProfileIcon name="chevron" size={11} /></button>
      </span>
    </span>
  </label>
}

/**
 * Styled native select.
 * @param props - `options` are value/label pairs; `onChange` receives the chosen value.
 * @returns The select field.
 */
export function Select({ label, options, value, onChange }: { label?: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  const control = <span className="wb-select">
    <select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    <ProfileIcon name="chevron" size={13} />
  </span>
  if (!label) return control
  return <label className="wb-field"><span className="wb-field-label">{label}</span>{control}</label>
}

/**
 * Checkbox row with a custom box.
 * @param props - `checked` is the state; `onChange` receives the next state.
 * @returns The checkbox.
 */
export function Checkbox({ checked, label, hint, onChange }: { checked: boolean; label: string; hint?: string; onChange: (next: boolean) => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} className="wb-checkbox" onClick={() => onChange(!checked)}>
    <span className="wb-checkbox-box">{checked && <ProfileIcon name="check" size={11} />}</span>
    <span className="wb-checkbox-text">{label}{hint && <span className="wb-field-hint">{hint}</span>}</span>
  </button>
}

/**
 * Radio group with custom circles.
 * @param props - `options` are value/label pairs; `name` groups the inputs.
 * @returns The radio group.
 */
export function RadioGroup({ name, options, value, onChange }: { name: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return <div className="wb-radio-group" role="radiogroup" aria-label={name}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className="wb-radio" onClick={() => onChange(option.value)}>
      <span className="wb-radio-dot" />
      <span>{option.label}</span>
    </button>)}
  </div>
}

/**
 * Range slider with tabular value readout.
 * @param props - `onChange` receives the next number.
 * @returns The slider field.
 */
export function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="wb-field">
    <span className="wb-field-label wb-slider-head"><span>{label}</span><span className="wb-slider-value">{value}</span></span>
    <input className="wb-slider" type="range" value={value} min={min} max={max} onChange={event => onChange(Number(event.target.value))} />
  </label>
}

/**
 * Token input: removable tags followed by a free-text entry.
 * @param props - `tags` are current tokens; `onRemove` removes one; input props drive the draft.
 * @returns The tag input.
 */
export function TagInput({ label, tags, value, placeholder, removeLabel, onChange, onRemove }: { label: string; tags: string[]; value: string; placeholder?: string; removeLabel: string; onChange: (value: string) => void; onRemove: (tag: string) => void }) {
  return <label className="wb-field">
    <span className="wb-field-label">{label}</span>
    <span className="wb-tag-input">
      {tags.map(tag => <span key={tag} className="wb-tag">{tag}<button type="button" aria-label={`${removeLabel} ${tag}`} onClick={() => onRemove(tag)}><ProfileIcon name="x" size={11} /></button></span>)}
      <input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    </span>
  </label>
}

/**
 * Horizontal form row: label column plus control.
 * @param props - `hint` shows under the control.
 * @returns The form row.
 */
export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="wb-field-row">
    <span className="wb-field-row-label">{label}</span>
    <span className="wb-field-row-control">{children}{hint && <span className="wb-field-hint">{hint}</span>}</span>
  </div>
}

/**
 * Input with a leading or trailing addon (unit, domain, currency).
 * @param props - `prefix`/`suffix` render inside the field frame.
 * @returns The addon field.
 */
export function AddonField({ label, prefix, suffix, value, placeholder, onChange }: { label?: string; prefix?: string; suffix?: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  const control = <span className="wb-addon">
    {prefix && <span className="wb-addon-part">{prefix}</span>}
    <input className="wb-input" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    {suffix && <span className="wb-addon-part">{suffix}</span>}
  </span>
  if (!label) return control
  return <label className="wb-field"><span className="wb-field-label">{label}</span>{control}</label>
}

/**
 * Date field using the native picker under workbench styling.
 * @param props - `onChange` receives the ISO date string.
 * @returns The date field.
 */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="wb-field">
    <span className="wb-field-label">{label}</span>
    <input className="wb-input" type="date" value={value} onChange={event => onChange(event.target.value)} />
  </label>
}

/**
 * Grouped fields under a legend.
 * @param props - `legend` names the group.
 * @returns The fieldset.
 */
export function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return <fieldset className="wb-fieldset"><legend>{legend}</legend>{children}</fieldset>
}

/**
 * Underline tabs.
 * @param props - `options` carry optional counts; `onChange` fires with the chosen value.
 * @returns The tab list.
 */
export function Tabs({ options, value, onChange, label }: { options: Array<{ value: string; label: string; count?: number }>; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="wb-tabs" role="tablist" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="tab" aria-selected={option.value === value} onClick={() => onChange(option.value)}>
      {option.label}{option.count !== undefined && <span className="wb-tabs-count">{option.count}</span>}
    </button>)}
  </div>
}

/**
 * Breadcrumb trail; the last item is the current page.
 * @param props - `items` are label/activation pairs in order.
 * @returns The breadcrumb navigation.
 */
export function Breadcrumb({ items, label }: { items: Array<{ label: string; onActivate?: () => void }>; label: string }) {
  return <nav className="wb-breadcrumb" aria-label={label}>
    {items.map((item, index) => {
      const last = index === items.length - 1
      return <span key={`${item.label}-${index}`} className="wb-breadcrumb-item">
        {index > 0 && <ProfileIcon name="chevronRight" size={12} />}
        {last || !item.onActivate ? <span aria-current={last ? 'page' : undefined}>{item.label}</span> : <button type="button" onClick={item.onActivate}>{item.label}</button>}
      </span>
    })}
  </nav>
}

/**
 * Page navigation with previous/next and numbered pages.
 * @param props - `page` is 1-based; `pages` is the total; `onChange` receives the next page.
 * @returns The pagination control.
 */
export function Pagination({ page, pages, onChange, label }: { page: number; pages: number; onChange: (page: number) => void; label: string }) {
  return <nav className="wb-pagination" aria-label={label}>
    <button type="button" disabled={page <= 1} aria-label="Previous" onClick={() => onChange(page - 1)}><ProfileIcon name="chevronLeft" size={14} /></button>
    {Array.from({ length: pages }, (_, index) => index + 1).map(item => <button key={item} type="button" aria-current={item === page ? 'page' : undefined} onClick={() => onChange(item)}>{item}</button>)}
    <button type="button" disabled={page >= pages} aria-label="Next" onClick={() => onChange(page + 1)}><ProfileIcon name="chevronRight" size={14} /></button>
  </nav>
}

/**
 * Wizard stepper with numbered nodes and connectors.
 * @param props - `steps` are labels; `current` is the 0-based active step.
 * @returns The stepper.
 */
export function Stepper({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return <ol className="wb-stepper" aria-label={label}>
    {steps.map((step, index) => <li key={step} data-state={index < current ? 'done' : index === current ? 'current' : 'todo'}>
      <span className="wb-stepper-node">{index < current ? <ProfileIcon name="check" size={11} /> : index + 1}</span>
      <span className="wb-stepper-label">{step}</span>
    </li>)}
  </ol>
}

/**
 * Sidebar navigation item with optional count.
 * @param props - `active` marks the current destination.
 * @returns The nav item.
 */
export function NavItem({ icon, label, count, active, onActivate }: { icon?: ProfileIconName; label: string; count?: number; active?: boolean; onActivate: () => void }) {
  return <button type="button" className="wb-nav-item" data-active={active || undefined} aria-current={active ? 'page' : undefined} onClick={onActivate}>
    {icon && <ProfileIcon name={icon} size={15} />}
    <span>{label}</span>
    {count !== undefined && <span className="wb-nav-count">{count}</span>}
  </button>
}

/**
 * Sidebar navigation section grouping items under a small caps label.
 * @param props - `label` is optional; `children` are NavItems.
 * @returns The nav section.
 */
export function NavSection({ label, children }: { label?: string; children: ReactNode }) {
  return <div className="wb-nav-section">{label && <span className="wb-nav-label">{label}</span>}{children}</div>
}

/** Alert tone. */
export type AlertTone = 'info' | 'success' | 'warn' | 'error'

/**
 * Inline alert banner with tone icon.
 * @param props - `action` renders a trailing control.
 * @returns The alert.
 */
export function Alert({ tone = 'info', title, children, action }: { tone?: AlertTone; title?: string; children: ReactNode; action?: ReactNode }) {
  return <div className="wb-alert" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
    <ProfileIcon name={tone === 'info' ? 'info' : tone === 'success' ? 'check' : 'alert'} size={16} />
    <div className="wb-alert-body">{title && <strong>{title}</strong>}<span>{children}</span></div>
    {action}
  </div>
}

/**
 * Notification toast card.
 * @param props - `onClose` dismisses.
 * @returns The toast.
 */
export function Toast({ tone = 'info', title, message, onClose }: { tone?: AlertTone; title: string; message?: string; onClose: () => void }) {
  return <div className="wb-toast" data-tone={tone} role="status">
    <ProfileIcon name={tone === 'info' ? 'info' : tone === 'success' ? 'check' : 'alert'} size={16} />
    <div className="wb-toast-body"><strong>{title}</strong>{message && <span>{message}</span>}</div>
    <button type="button" className="wb-toast-close" aria-label="Dismiss" onClick={onClose}><ProfileIcon name="x" size={13} /></button>
  </div>
}

/**
 * Loading spinner.
 * @param props - `size` is the diameter in pixels; `label` is the accessible name.
 * @returns The spinner.
 */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return <span className="wb-spinner" style={{ width: size, height: size }} role="status" aria-label={label} />
}

/**
 * Three-dot thinking indicator for AI work.
 * @param props - `label` is the accessible name.
 * @returns The thinking indicator.
 */
export function ThinkingDots({ label }: { label?: string }) {
  return <span className="wb-thinking" role="status" aria-label={label}><span /><span /><span /></span>
}

/**
 * Empty or error state block with icon, title, hint and actions.
 * @param props - `children` carries the action buttons.
 * @returns The result state.
 */
export function ResultState({ icon, title, hint, children }: { icon: ProfileIconName; title: string; hint?: string; children?: ReactNode }) {
  return <div className="wb-result">
    <span className="wb-result-icon"><ProfileIcon name={icon} size={22} /></span>
    <strong>{title}</strong>
    {hint && <p>{hint}</p>}
    {children && <div className="wb-result-actions">{children}</div>}
  </div>
}

/**
 * Notification row: actor avatar, summary, time and an unread marker.
 * @param props - `unread` shows the marker dot.
 * @returns The notification item.
 */
export function NotificationItem({ actor, title, body, time, unread, onActivate }: { actor: string; title: string; body: string; time: string; unread?: boolean; onActivate: () => void }) {
  return <button type="button" className="wb-notification" data-unread={unread || undefined} onClick={onActivate}>
    <Avatar label={actor} size={28} />
    <span className="wb-notification-body"><span><strong>{title}</strong> {body}</span><span className="wb-notification-time">{time}</span></span>
    {unread && <span className="wb-notification-dot" />}
  </button>
}

/** Table column definition. */
export interface TableColumn { key: string; label: string; align?: 'left' | 'right' }

/**
 * Hairline data table with right-alignable numeric columns.
 * @param props - `columns` define order and alignment; `rows` map column keys to cells.
 * @returns The data table.
 */
export function DataTable({ columns, rows, label }: { columns: TableColumn[]; rows: Array<Record<string, ReactNode>>; label: string }) {
  return <table className="wb-table" aria-label={label}>
    <thead><tr>{columns.map(column => <th key={column.key} style={{ textAlign: column.align }}>{column.label}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column.key} style={{ textAlign: column.align }} data-numeric={column.align === 'right' || undefined}>{row[column.key]}</td>)}</tr>)}</tbody>
  </table>
}

/**
 * Label/value description rows.
 * @param props - `items` are label/value pairs.
 * @returns The description list.
 */
export function DescriptionList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return <dl className="wb-desc">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
}

/**
 * Metric display: label, large tabular value and an optional delta.
 * @param props - `delta` carries direction and text.
 * @returns The stat block.
 */
export function Stat({ label, value, delta }: { label: string; value: string; delta?: { up: boolean; text: string } }) {
  return <div className="wb-stat">
    <span className="wb-stat-label">{label}</span>
    <span className="wb-stat-value">{value}</span>
    {delta && <Delta up={delta.up} text={delta.text} />}
  </div>
}

/**
 * Row of stats separated by hairlines.
 * @param props - Stat children.
 * @returns The stat row.
 */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="wb-stat-row">{children}</div>
}

/**
 * Up/down delta indicator.
 * @param props - `up` selects direction and tone.
 * @returns The delta.
 */
export function Delta({ up, text }: { up: boolean; text: string }) {
  return <span className="wb-delta" data-up={up}><ProfileIcon name={up ? 'arrowUp' : 'arrow'} size={11} />{text}</span>
}

/**
 * Polyline points for a sparkline, padded inside the frame.
 * @param values - Series values; fewer than two points yields an empty string.
 * @param width - Frame width in pixels.
 * @param height - Frame height in pixels.
 * @returns The space-separated polyline points.
 */
export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const range = Math.max(...values) - min
  const pad = 2
  return values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2)
    const y = range === 0 ? height / 2 : pad + (1 - (value - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

/**
 * Inline SVG sparkline.
 * @param props - `values` are the series; `tone` selects the stroke.
 * @returns The sparkline.
 */
export function Sparkline({ values, width = 96, height = 26, tone }: { values: number[]; width?: number; height?: number; tone?: 'accent' | 'success' | 'warn' }) {
  return <svg className="wb-sparkline" data-tone={tone} width={width} height={height} aria-hidden="true">
    <polyline points={sparklinePoints(values, width, height)} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

/**
 * Mini bar chart.
 * @param props - `values` scale to the tallest bar.
 * @returns The bar chart.
 */
export function MiniBars({ values, height = 28, tone }: { values: number[]; height?: number; tone?: 'accent' | 'success' | 'warn' }) {
  const max = Math.max(...values, 1)
  return <span className="wb-bars" data-tone={tone} style={{ height }} aria-hidden="true">
    {values.map((value, index) => <span key={index} style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />)}
  </span>
}

/**
 * Segmented donut chart with an optional center label.
 * @param props - `segments` are value/color pairs; colors default to the accent scale.
 * @returns The donut.
 */
export function Donut({ segments, size = 44, centerLabel }: { segments: Array<{ value: number; color?: string }>; size?: number; centerLabel?: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1
  const stroke = 5
  const radius = (size - stroke) / 2
  const length = 2 * Math.PI * radius
  let offset = 0
  const tones = ['var(--workbench-accent)', 'var(--dsw-alias-state-success-primary)', 'var(--dsw-alias-state-warn-primary)', 'var(--workbench-muted)']
  return <span className="wb-donut" style={{ width: size, height: size }}>
    <svg width={size} height={size}>
      {segments.map((segment, index) => {
        const fraction = segment.value / total
        const dash = `${(fraction * length).toFixed(2)} ${length.toFixed(2)}`
        const node = <circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color ?? tones[index % tones.length]} strokeWidth={stroke} strokeDasharray={dash} strokeDashoffset={-offset * length} />
        offset += fraction
        return node
      })}
    </svg>
    {centerLabel && <span className="wb-donut-label">{centerLabel}</span>}
  </span>
}

/**
 * Removable tag token.
 * @param props - `onRemove` shows the remove button when set.
 * @returns The tag.
 */
export function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return <span className="wb-tag">{label}{onRemove && <button type="button" aria-label={label} onClick={onRemove}><ProfileIcon name="x" size={11} /></button>}</span>
}

/**
 * Inline code.
 * @param props - Code text.
 * @returns The code element.
 */
export function Code({ children }: { children: ReactNode }) {
  return <code className="wb-code">{children}</code>
}

/**
 * Code block with a header row and copy action.
 * @param props - `code` is the source; `language` labels the header.
 * @returns The code block.
 */
export function CodeBlock({ code, language, copyLabel, doneLabel }: { code: string; language?: string; copyLabel: string; doneLabel: string }) {
  return <div className="wb-codeblock">
    <div className="wb-codeblock-head"><span>{language}</span><CopyButton text={code} label={copyLabel} doneLabel={doneLabel} /></div>
    <pre><code>{code}</code></pre>
  </div>
}

/**
 * File row: icon, name, size and a status badge.
 * @param props - `status` pairs a badge tone with its label.
 * @returns The file row.
 */
export function FileRow({ name, size, status, onActivate }: { name: string; size: string; status?: { tone: 'blue' | 'amber' | 'green' | 'red' | 'gray'; label: string }; onActivate: () => void }) {
  return <button type="button" className="wb-filerow" onClick={onActivate}>
    <ProfileIcon name="file" size={16} />
    <span className="wb-filerow-name">{name}</span>
    <span className="wb-filerow-size">{size}</span>
    {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
  </button>
}

/**
 * Format a monetary amount.
 * @param amount - Numeric amount.
 * @param currency - ISO currency code.
 * @param locale - BCP 47 locale.
 * @returns The formatted currency string.
 */
export function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

/**
 * Currency amount in tabular numerals.
 * @param props - `tone` mutes or colors the amount.
 * @returns The money text.
 */
export function MoneyText({ amount, currency, locale, tone }: { amount: number; currency: string; locale: string; tone?: 'muted' | 'success' }) {
  return <span className="wb-money" data-tone={tone}>{formatMoney(amount, currency, locale)}</span>
}

/**
 * Hairline divider with an optional centered label.
 * @param props - `label` sits in the middle when set.
 * @returns The divider.
 */
export function Divider({ label }: { label?: string }) {
  return <div className="wb-divider" role="separator">{label && <span>{label}</span>}</div>
}

/**
 * The single bordered surface primitive; use sparingly, ledgers stay open.
 * @param props - `padding` toggles the inner padding.
 * @returns The surface container.
 */
export function Surface({ padding = true, children }: { padding?: boolean; children: ReactNode }) {
  return <div className="wb-surface" data-padding={padding || undefined}>{children}</div>
}

/**
 * Collapsible disclosure section.
 * @param props - `defaultOpen` starts expanded.
 * @returns The disclosure.
 */
export function Disclosure({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return <details className="wb-disclosure" open={defaultOpen}>
    <summary><ProfileIcon name="chevronRight" size={13} />{title}</summary>
    <div className="wb-disclosure-body">{children}</div>
  </details>
}

/**
 * Modal dialog over a dimmed canvas.
 * @param props - `actions` carries the footer buttons; `onClose` dismisses.
 * @returns The dialog overlay.
 */
export function Dialog({ title, children, actions, onClose, label }: { title: string; children: ReactNode; actions?: ReactNode; onClose: () => void; label: string }) {
  return <div className="wb-overlay">
    <div className="wb-dialog" role="dialog" aria-label={label}>
      <div className="wb-dialog-head"><strong>{title}</strong><IconButton icon="x" label={label} onActivate={onClose} /></div>
      <div className="wb-dialog-body">{children}</div>
      {actions && <div className="wb-dialog-actions">{actions}</div>}
    </div>
  </div>
}

/**
 * Anchored popover panel.
 * @param props - `label` names the panel.
 * @returns The popover.
 */
export function Popover({ label, children }: { label: string; children: ReactNode }) {
  return <div className="wb-popover" role="dialog" aria-label={label}>{children}</div>
}

/**
 * Command palette: search field, grouped commands and a key-hint footer.
 * @param props - `items` are the visible commands; `footer` carries key caps.
 * @returns The command palette panel.
 */
export function CommandPalette({ query, placeholder, items, footer, onChange, onPick }: { query: string; placeholder: string; items: Array<{ icon?: ProfileIconName; label: string; hint?: string }>; footer?: ReactNode; onChange: (value: string) => void; onPick: (label: string) => void }) {
  return <div className="wb-command" role="dialog" aria-label={placeholder}>
    <div className="wb-command-head"><ProfileIcon name="search" size={15} /><input value={query} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></div>
    <div className="wb-command-list" role="listbox">
      {items.map((item, index) => <button key={item.label} type="button" role="option" aria-selected={index === 0} className="wb-command-item" onClick={() => onPick(item.label)}>
        {item.icon && <ProfileIcon name={item.icon} size={15} />}<span>{item.label}</span>{item.hint && <span className="wb-menu-hint">{item.hint}</span>}
      </button>)}
    </div>
    {footer && <div className="wb-command-foot">{footer}</div>}
  </div>
}

/**
 * Rich hover preview card.
 * @param props - `title` heads the card.
 * @returns The hover card.
 */
export function HoverCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="wb-hovercard"><strong>{title}</strong><div>{children}</div></div>
}

/**
 * AI prompt composer: multiline entry with a send button and a hint row.
 * @param props - `onSend` submits the current value.
 * @returns The prompt input.
 */
export function PromptInput({ value, placeholder, hint, sendLabel, onChange, onSend }: { value: string; placeholder: string; hint?: string; sendLabel: string; onChange: (value: string) => void; onSend: () => void }) {
  return <div className="wb-prompt">
    <textarea value={value} placeholder={placeholder} rows={2} onChange={event => onChange(event.target.value)} />
    <div className="wb-prompt-foot">
      <span className="wb-field-hint">{hint}</span>
      <button type="button" className="wb-prompt-send" aria-label={sendLabel} onClick={onSend}><ProfileIcon name="send" size={14} /></button>
    </div>
  </div>
}

/**
 * Streaming text with a blinking caret while `done` is false.
 * @param props - `text` is the received prefix.
 * @returns The streaming text.
 */
export function StreamingText({ text, done }: { text: string; done?: boolean }) {
  return <span className="wb-streaming">{text}{!done && <span className="wb-caret" />}</span>
}

/**
 * Source citation chip with an index marker.
 * @param props - `index` is the 1-based citation number.
 * @returns The citation chip.
 */
export function CitationChip({ index, label, onActivate }: { index: number; label: string; onActivate: () => void }) {
  return <button type="button" className="wb-citation" onClick={onActivate}><span>{index}</span>{label}</button>
}

/**
 * Live agent run row: avatar, task, status glyph and elapsed timer.
 * @param props - `status` is the run's glyph state; `since` starts the timer.
 * @returns The agent run row.
 */
export function AgentRun({ actor, title, status, since, now, onActivate }: { actor: string; title: string; status: StatusIconName; since: string; now?: number; onActivate: () => void }) {
  return <button type="button" className="wb-agentrun" onClick={onActivate}>
    <Avatar label={actor} size={24} />
    <span className="wb-agentrun-body"><strong>{title}</strong><span>{actor}</span></span>
    <StatusIcon status={status} />
    <Elapsed since={since} now={now} />
  </button>
}

/**
 * Page header: breadcrumb, title, description and trailing actions.
 * @param props - `actions` carries page-level buttons.
 * @returns The page header.
 */
export function PageHeader({ breadcrumb, title, description, actions }: { breadcrumb?: ReactNode; title: string; description?: string; actions?: ReactNode }) {
  return <div className="wb-pagehead">
    {breadcrumb}
    <div className="wb-pagehead-row">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="wb-pagehead-actions">{actions}</div>}
    </div>
  </div>
}

/**
 * Toolbar row for search, filters and actions.
 * @param props - Toolbar children.
 * @returns The toolbar.
 */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="wb-toolbar">{children}</div>
}

/**
 * Active filter chip with a remove button.
 * @param props - `onRemove` clears the filter.
 * @returns The filter chip.
 */
export function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return <span className="wb-filterchip"><span className="wb-filterchip-label">{label}</span>{value}<button type="button" aria-label={label} onClick={onRemove}><ProfileIcon name="x" size={11} /></button></span>
}

/**
 * Flex stack with consistent gaps.
 * @param props - `direction` and `gap` control layout.
 * @returns The stack container.
 */
export function Stack({ direction = 'vertical', gap = 12, children }: { direction?: 'vertical' | 'horizontal'; gap?: number; children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: direction === 'vertical' ? 'column' : 'row', gap, alignItems: direction === 'vertical' ? 'stretch' : 'center' }}>{children}</div>
}

/**
 * Two-pane split view with a hairline divider.
 * @param props - `ratio` sets the first pane's flex share; exactly two children.
 * @returns The split view.
 */
export function SplitView({ ratio = 1, children }: { ratio?: number; children: [ReactNode, ReactNode] }) {
  return <div className="wb-splitview">
    <div style={{ flex: ratio }}>{children[0]}</div>
    <div className="wb-splitview-second">{children[1]}</div>
  </div>
}

/**
 * Auto-fitting responsive grid.
 * @param props - `min` is the minimum column width in pixels.
 * @returns The grid container.
 */
export function Grid({ min = 220, gap = 14, children }: { min?: number; gap?: number; children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap }}>{children}</div>
}

/**
 * Dashed empty slot for dropzones and placeholders.
 * @param props - `children` carries an optional action.
 * @returns The empty slot.
 */
export function EmptySlot({ icon, title, hint, children }: { icon?: ProfileIconName; title: string; hint?: string; children?: ReactNode }) {
  return <div className="wb-emptyslot">
    {icon && <ProfileIcon name={icon} size={18} />}
    <strong>{title}</strong>
    {hint && <span>{hint}</span>}
    {children}
  </div>
}

/**
 * Key cap sequence joined by plus signs.
 * @param props - `keys` render in order.
 * @returns The key combo.
 */
export function KbdCombo({ keys }: { keys: string[] }) {
  return <span className="wb-kbd-combo">{keys.map((key, index) => <span key={index}>{index > 0 && <span className="wb-kbd-plus">+</span>}<Kbd>{key}</Kbd></span>)}</span>
}

/**
 * Opportunity match score ring, colored by threshold.
 * @param props - `score` is 0–100.
 * @returns The match score.
 */
export function MatchScore({ score, size = 40 }: { score: number; size?: number }) {
  const tone = score >= 70 ? 'var(--dsw-alias-state-success-primary)' : score >= 40 ? 'var(--workbench-accent)' : 'var(--workbench-muted)'
  const stroke = 3.5
  const radius = (size - stroke) / 2
  const length = 2 * Math.PI * radius
  return <span className="wb-ring" style={{ width: size, height: size }}>
    <svg width={size} height={size}>
      <circle className="wb-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(100, Math.max(0, score)) / 100)} />
    </svg>
    <span className="wb-ring-value" style={{ color: tone }}>{score}</span>
  </span>
}

/**
 * Opportunity pipeline stage flow.
 * @param props - `stages` are labels; `current` is the 0-based active stage.
 * @returns The pipeline steps.
 */
export function PipelineSteps({ stages, current }: { stages: string[]; current: number }) {
  return <ol className="wb-pipeline">
    {stages.map((stage, index) => <li key={stage} data-state={index < current ? 'done' : index === current ? 'current' : 'todo'}>{stage}</li>)}
  </ol>
}

/**
 * Usage meter that warns near the limit.
 * @param props - `used`/`total` drive the fill and tone.
 * @returns The quota meter.
 */
export function QuotaMeter({ used, total, label }: { used: number; total: number; label: string }) {
  const percent = total > 0 ? (used / total) * 100 : 0
  return <ProgressBar value={percent} tone={percent > 85 ? 'warn' : 'accent'} label={`${label} ${used}/${total}`} />
}

/**
 * Contact card: avatar, name, role and email.
 * @param props - `onActivate` opens the contact.
 * @returns The contact card.
 */
export function ContactCard({ name, role, email, onActivate }: { name: string; role?: string; email?: string; onActivate: () => void }) {
  return <button type="button" className="wb-contact" onClick={onActivate}>
    <Avatar label={name} size={34} />
    <span className="wb-contact-body"><strong>{name}</strong>{role && <span>{role}</span>}{email && <span className="wb-contact-mail">{email}</span>}</span>
    <ProfileIcon name="mail" size={15} />
  </button>
}
