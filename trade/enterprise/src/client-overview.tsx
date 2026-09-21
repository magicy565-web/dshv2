/** Home surfaces the active goal, work in motion, pending decisions and confirmed outcomes from the saved snapshot. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Snapshot } from './schema.ts'
import type { BusinessGoal } from './business-goals-schema.ts'
import type { EnterpriseKey } from './locales.ts'
import { ActorMark, BlockEmpty, Chip, Dot, EmptyHero, Eyebrow, Hero, HeroBanner, HeroCount, HeroFacts, HeroLede, HeroMain, HeroMeta, HeroTitle, Meter, Quiet, Row, RowList, Section, TextLink, Timeline, TimelineEvent } from './workbench-ui.tsx'

type Destination = 'supplier' | 'assets' | 'opportunities' | 'tasks' | 'ai' | 'goals'
type T = PropsLocale<'enterprise'>['t']

const taskStatusKeys = { todo: 'taskTodo', in_progress: 'taskInProgress', blocked: 'taskBlocked', done: 'taskDone' } as const
const opportunityStatusKeys = { lead: 'opportunityLead', researching: 'opportunityResearching', qualified: 'opportunityQualified', contacted: 'opportunityContacted', negotiating: 'opportunityNegotiating', won: 'opportunityWon', lost: 'opportunityLost' } as const
const goalStatusKeys = { active: 'businessGoalActive', paused: 'businessGoalPaused', achieved: 'businessGoalAchieved' } as const
const pipeline: Array<keyof typeof opportunityStatusKeys> = ['researching', 'qualified', 'contacted', 'negotiating']

const dayStart = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()

/** Calendar-day labels stay relative to the viewer; older entries fall back to a numeric date. */
function dayLabel(iso: string, t: T): string {
  const date = new Date(iso)
  const days = Math.round((dayStart(new Date()) - dayStart(date)) / 86400000)
  if (days <= 0) return t('workbenchToday')
  if (days === 1) return t('workbenchYesterday')
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** The headline goal: the active goal with the nearest deadline, otherwise the most recently updated one. */
function currentGoal(goals: BusinessGoal[]): BusinessGoal | undefined {
  const open = goals.filter(goal => !goal.archived)
  const active = open.filter(goal => goal.status === 'active')
  const byDue = (a: BusinessGoal, b: BusinessGoal) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.updatedAt.localeCompare(a.updatedAt)
  return active.sort(byDue)[0] ?? open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

/** Drafts and confirmed records that are neither archived nor replaced by a newer revision. */
function currentRecords(data: Snapshot): Snapshot['geo'] {
  return data.geo.filter(record => !record.archivedAt && !data.geo.some(next => !next.archivedAt && next.supersedesId === record.id))
}

interface StreamItem { id: string; actor: string; pulse: boolean; title: string; meta: string[]; statusKey: EnterpriseKey; time: string; destination: Destination }
interface AttentionItem { id: string; title: string; kindKey: EnterpriseKey; agent: boolean; time: string; destination: Destination }
interface ResultItem { id: string; kindKey: EnterpriseKey; title: string; detail: string; time: string; destination: Destination }

/**
 * Present the workspace home: the current business goal, a live workstream, a decision queue and an outcome timeline.
 * @param props - Saved snapshot, localized labels and tab navigation.
 * @returns Goal brief, workstream, attention queue and outcome timeline, or a first-run goal prompt.
 */
export function EnterpriseOverview({ data, t, navigate }: PropsLocale<'enterprise'> & { data: Snapshot; navigate: (destination: Destination) => void }) {
  const goal = currentGoal(data.goals)
  const linked = goal ? data.tasks.filter(task => task.goalId === goal.id && !task.archived) : []
  const goalDaysLeft = goal?.dueDate ? Math.ceil((dayStart(new Date(goal.dueDate)) - dayStart(new Date())) / 86400000) : null
  const goalTimePercent = goal?.dueDate
    ? Math.min(100, Math.max(0, Math.round(((Date.now() - new Date(goal.createdAt).getTime()) / (new Date(goal.dueDate).getTime() - new Date(goal.createdAt).getTime())) * 100)))
    : null

  const records = currentRecords(data)
  const goalTitle = (id: BusinessGoal['id'] | null): string | null => id ? data.goals.find(item => item.id === id)?.title ?? null : null

  const stream: StreamItem[] = [
    ...data.tasks.filter(task => !task.archived && task.status === 'in_progress').map((task): StreamItem => ({
      id: task.id, actor: task.assignee, pulse: true, title: task.title, time: task.updatedAt, destination: 'tasks', statusKey: taskStatusKeys[task.status],
      meta: [t('workbenchKindTask'), task.assignee || t('taskUnassigned'), ...(goalTitle(task.goalId) ? [t('workbenchLinkedGoal', { title: goalTitle(task.goalId)! })] : [])],
    })),
    ...data.opportunities.filter(item => !item.archived && pipeline.includes(item.status)).map((item): StreamItem => ({
      id: item.id, actor: item.buyerName, pulse: item.status === 'researching', title: item.buyerName, time: item.updatedAt, destination: 'opportunities', statusKey: opportunityStatusKeys[item.status],
      meta: [t('workbenchKindOpportunity'), item.country, item.targetProduct, ...(item.nextAction ? [t('workbenchNextAction', { action: item.nextAction })] : [])],
    })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6)

  const attention: AttentionItem[] = [
    ...data.tasks.filter(task => !task.archived && task.status === 'blocked').map(task => ({ id: task.id, title: task.title, kindKey: 'workbenchAttentionBlocked' as const, agent: false, time: task.updatedAt, destination: 'tasks' as const })),
    ...records.filter(record => record.status === 'draft').map(record => ({ id: record.id, title: record.name, kindKey: 'workbenchAttentionDraft' as const, agent: record.createdBy === 'agent', time: record.updatedAt, destination: 'ai' as const })),
    ...data.files.filter(file => file.knowledgeStatus === 'failed').map(file => ({ id: file.id, title: file.name, kindKey: 'workbenchAttentionFailed' as const, agent: false, time: file.createdAt, destination: 'assets' as const })),
    ...data.opportunities.filter(item => !item.archived && item.status === 'lead').map(item => ({ id: item.id, title: item.buyerName, kindKey: 'workbenchAttentionLead' as const, agent: false, time: item.updatedAt, destination: 'opportunities' as const })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5)

  const results: ResultItem[] = [
    ...data.tasks.filter(task => !task.archived && task.status === 'done').map(task => ({ id: task.id, kindKey: 'workbenchResultTask' as const, title: task.title, detail: task.outcome, time: task.updatedAt, destination: 'tasks' as const })),
    ...data.opportunities.filter(item => !item.archived && item.status === 'won').map(item => ({ id: item.id, kindKey: 'workbenchResultWon' as const, title: item.buyerName, detail: item.targetProduct, time: item.updatedAt, destination: 'opportunities' as const })),
    ...records.filter(record => record.status === 'confirmed').map(record => ({ id: record.id, kindKey: 'workbenchResultConfirmed' as const, title: record.name, detail: record.kind === 'company' ? t('profile') : t('workbenchKindProduct'), time: record.confirmedAt ?? record.updatedAt, destination: 'supplier' as const })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5)

  if (!goal && !stream.length && !attention.length && !results.length) {
    return <EmptyHero eyebrow={t('workbenchStartEyebrow')} title={t('workbenchGoalCreate')} hint={t('workbenchGoalCreateHint')}>
      <Button variant="primary" onClick={() => navigate('goals')}>{t('workbenchGoalCreateAction')}</Button>
      <TextLink onActivate={() => navigate('assets')}>{t('workbenchStartSources')}</TextLink>
    </EmptyHero>
  }

  return <div className="wb-home">
    <Hero status={goal?.status ?? 'none'} label={t('workbenchGoalEyebrow')}>
      {goal ? <>
        <HeroMain>
          <HeroMeta>
            <Eyebrow>{t('workbenchGoalEyebrow')}</Eyebrow>
            <Chip status={goal.status}>{t(goalStatusKeys[goal.status])}</Chip>
            <TextLink end onActivate={() => navigate('goals')}>{t('workbenchGoalView')}</TextLink>
          </HeroMeta>
          <HeroTitle>{goal.title}</HeroTitle>
          <HeroLede>{goal.successCriteria}</HeroLede>
          <HeroFacts>
            <span>{linked.length ? t('businessGoalTaskCount', { done: linked.filter(task => task.status === 'done').length, total: linked.length, blocked: linked.filter(task => task.status === 'blocked').length }) : t('workbenchGoalNoTasks')}</span>
            <span>{goal.dueDate ? t('workbenchGoalDue', { date: goal.dueDate }) : t('workbenchGoalNoDue')}</span>
          </HeroFacts>
          {goalTimePercent !== null && <Meter percent={goalTimePercent} label={t('workbenchGoalTime')} />}
        </HeroMain>
        {goalDaysLeft !== null && <HeroCount value={Math.abs(goalDaysLeft)} caption={t(goalDaysLeft >= 0 ? 'workbenchGoalDueIn' : 'workbenchGoalOverdueCaption')} />}
      </> : <HeroBanner eyebrow={t('workbenchStartEyebrow')} title={t('workbenchGoalCreate')}>
        <Button variant="primary" onClick={() => navigate('goals')}>{t('workbenchGoalCreateAction')}</Button>
      </HeroBanner>}
    </Hero>

    <div className="wb-main">
      <Section label={t('workbenchStream')} title={t('workbenchStream')} note={t('workbenchStreamHint')}>
        {stream.length ? <RowList>
          {stream.map(item => <Row key={item.id}
            leading={<ActorMark label={item.actor} pulse={item.pulse} />}
            title={item.title} pill={t(item.statusKey)} time={dayLabel(item.time, t)} meta={item.meta.join(' · ')}
            onActivate={() => navigate(item.destination)} />)}
        </RowList> : <BlockEmpty title={t('workbenchStreamEmpty')} hint={t('workbenchStreamEmptyHint')}>
          <TextLink onActivate={() => navigate('tasks')}>{t('taskCreate')}</TextLink>
          <TextLink onActivate={() => navigate('opportunities')}>{t('opportunityResearch')}</TextLink>
        </BlockEmpty>}
      </Section>

      <Section complementary label={t('workbenchAttention')} title={t('workbenchAttention')} count={attention.length} countTone="warn">
        {attention.length ? <RowList>
          {attention.map(item => <Row key={item.id}
            leading={<Dot tone="warn" />}
            title={item.title} time={dayLabel(item.time, t)}
            meta={`${t(item.kindKey)}${item.agent ? ` · ${t('workbenchByAgent')}` : ''}`}
            onActivate={() => navigate(item.destination)} />)}
        </RowList> : <Quiet>{t('workbenchAttentionEmpty')}</Quiet>}
      </Section>
    </div>

    {results.length > 0 && <Section className="wb-results" label={t('workbenchResults')} title={t('workbenchResults')}>
      <Timeline>
        {results.map(item => <TimelineEvent key={item.id}
          time={dayLabel(item.time, t)} kind={t(item.kindKey)} title={item.title} detail={item.detail || undefined}
          onActivate={() => navigate(item.destination)} />)}
      </Timeline>
    </Section>}
  </div>
}
