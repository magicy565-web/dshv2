/** Presentational enterprise components. Callers own copy, data and business actions. */
import { useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { ProfileIcon } from '../profile-icons.tsx'
import type { ProfileIconName } from '../profile-icons.tsx'

/** Semantic color roles; status labels must also name their meaning in text. */
export type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

/** Render an action with native keyboard behavior. @param props - Native button props and visual state. @returns A button; loading prevents repeat activation. */
export function ActionButton({ variant = 'primary', size = 'normal', loading = false, icon, children, className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet'; size?: 'normal' | 'small'; loading?: boolean; icon?: ReactNode }) {
  return <button type="button" {...props} className={`td-button td-button--${variant} td-button--${size} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading ? <span className="td-spinner" aria-hidden="true" /> : icon}{children}
  </button>
}

/** Render a named status. @param props - Localized label and semantic tone. @returns A compact badge with a decorative marker. */
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`td-badge td-badge--${tone}`}><span aria-hidden="true" />{children}</span>
}

/** Group related content without imposing a heading level. @param props - Contents and optional layout class. @returns A bordered surface. */
export function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`td-surface ${className}`}>{children}</div>
}

/** Introduce a component group. @param props - Localized heading, description, index and optional action. @returns A level-two heading with supporting content. */
export function SectionHeading({ index, title, description, action }: { index: string; title: string; description: string; action?: ReactNode }) {
  return <header className="td-section-heading"><div><span className="td-section-index">{index}</span><h2>{title}</h2><p>{description}</p></div>{action}</header>
}

/** Present an observed value; callers supply its meaning. @param props - Label, value, supporting text and icon. @returns A metric card without inferred trends. */
export function MetricCard({ label, value, detail, icon, tone = 'neutral' }: { label: string; value: string; detail: string; icon: ProfileIconName; tone?: Tone }) {
  return <Surface className={`td-metric td-metric--${tone}`}><div className="td-metric-top"><span>{label}</span><ProfileIcon name={icon} /></div><strong>{value}</strong><p>{detail}</p></Surface>
}

/** Steps reflect caller-owned progress; current steps remain distinct from completed steps. */
export interface ProgressStep { id: string; label: string; detail: string; state: 'complete' | 'current' | 'upcoming' }

/** Show an ordered workflow. @param props - Accessible list label and explicit step states. @returns Progress readable without color. */
export function ProgressSteps({ label, steps }: { label: string; steps: readonly ProgressStep[] }) {
  return <ol className="td-steps" aria-label={label}>{steps.map((step, index) => <li key={step.id} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
    <span className="td-step-dot" aria-hidden="true">{step.state === 'complete' ? <svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg> : String(index + 1).padStart(2, '0')}</span>
    <div><strong>{step.label}</strong><small>{step.detail}</small></div>
  </li>)}</ol>
}

/** Render a source without making the whole row an implicit button. @param props - File metadata, explicit status and optional action. @returns A source row with a caller-owned action. */
export function SourceRow({ name, detail, format, status, tone, action }: { name: string; detail: string; format: string; status: string; tone: Tone; action?: ReactNode }) {
  return <div className="td-source-row"><span className={`td-file-icon td-file-icon--${tone}`} aria-hidden="true"><ProfileIcon name="commercial_policy" size={25} /><small>{format}</small></span>
    <div className="td-source-name"><strong>{name}</strong><span>{detail}</span></div><StatusBadge tone={tone}>{status}</StatusBadge>{action}
  </div>
}

/** Present source-backed content for a separate human action. @param props - Heading, excerpt, source and caller-owned action controls. @returns A review card without confirmation authority. */
export function ReviewCard({ eyebrow, title, status, children, citation, note, actions }: { eyebrow: string; title: string; status: ReactNode; children: ReactNode; citation: string; note: string; actions: ReactNode }) {
  return <Surface className="td-review"><div className="td-card-top"><span className="td-eyebrow">{eyebrow}</span>{status}</div><h3>{title}</h3><div className="td-review-excerpt">{children}</div><div className="td-citation"><ProfileIcon name="link" size={14} /><span>{citation}</span></div><p className="td-review-note">{note}</p><div className="td-card-actions">{actions}</div></Surface>
}

/** Present a product using caller-supplied media and specifications. @param props - Product content and actions. @returns An article with a structured specification list. */
export function ProductCard({ media, category, title, description, status, specifications, actions }: { media: ReactNode; category: string; title: string; description: string; status: ReactNode; specifications: ReadonlyArray<{ label: string; value: string }>; actions: ReactNode }) {
  return <article className="td-surface td-product"><div className="td-product-media">{media}</div><div className="td-product-body"><div className="td-card-top"><span className="td-eyebrow">{category}</span>{status}</div><h3>{title}</h3><p>{description}</p><dl className="td-specs">{specifications.map(spec => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl><div className="td-card-actions">{actions}</div></div></article>
}

/** Guide the next step in an empty section. @param props - Localized explanation, decorative icon and action. @returns A centered empty state. */
export function EmptyState({ title, description, icon = 'offering', action }: { title: string; description: string; icon?: ProfileIconName; action?: ReactNode }) {
  return <div className="td-empty"><span className="td-empty-icon"><ProfileIcon name={icon} size={29} /></span><h3>{title}</h3><p>{description}</p>{action}</div>
}

/** Associate help and errors with a native input. @param props - Native input props and localized label/help. @returns A labelled input with an announced error. */
export function TextField({ label, hint, error, className = '', id: givenId, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | undefined }) {
  const generated = useId(), id = givenId ?? generated
  const description = [props['aria-describedby'], hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined
  return <div className={`td-field ${className}`}><label htmlFor={id}>{label}</label><input {...props} id={id} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={description} />{hint && <small id={`${id}-hint`}>{hint}</small>}{error && <small className="td-field-error" id={`${id}-error`} role="alert">{error}</small>}</div>
}

/** A controlled filter uses buttons rather than tabs because it has no tab panels. @param props - Current value and named options. @returns A labelled group of pressed-state buttons. */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <div className="td-segmented" role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
}

/** Render a short activity history. @param props - Named list with explicit times and details. @returns A semantic timeline. */
export function ActivityList({ label, items }: { label: string; items: ReadonlyArray<{ id: string; title: string; detail: string; time: string; tone: Tone }> }) {
  return <ol className="td-activity" aria-label={label}>{items.map(item => <li key={item.id}><span className={`td-activity-dot td-activity-dot--${item.tone}`} aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p></div><span className="td-activity-time">{item.time}</span></li>)}</ol>
}
