/** Enterprise overview derives all counts and next actions from the saved snapshot. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Snapshot } from './schema.ts'
import { ProfileIcon } from './profile-icons.tsx'
import type { ProfileIconName } from './profile-icons.tsx'
import type { EnterpriseKey } from './locales.ts'

type Destination = 'supplier' | 'assets' | 'opportunities' | 'tasks' | 'ai'

/**
 * Present saved business records with links to their owning workspace views.
 * @param props - Saved snapshot, localized labels and tab navigation.
 * @returns Business summary, next actions and open tasks.
 */
export function EnterpriseOverview({ data, t, navigate }: PropsLocale<'enterprise'> & { data: Snapshot; navigate: (destination: Destination) => void }) {
  const tasks = data.tasks.filter(task => !task.archived && task.status !== 'done')
  const opportunities = data.opportunities.filter(item => !item.archived && item.status !== 'won' && item.status !== 'lost')
  const metrics: Array<{ destination: Destination; icon: ProfileIconName; labelKey: EnterpriseKey; hint: EnterpriseKey; count: number }> = [
    { destination: 'supplier', icon: 'company', labelKey: 'workbenchRecords', hint: 'workbenchRecordsHint', count: data.geo.filter(record => record.status === 'confirmed').length },
    { destination: 'assets', icon: 'commercial_policy', labelKey: 'assets', hint: 'workbenchAssetsHint', count: data.files.length },
    { destination: 'opportunities', icon: 'globe', labelKey: 'workbenchLeads', hint: 'workbenchLeadsHint', count: opportunities.length },
    { destination: 'tasks', icon: 'case', labelKey: 'workbenchTasks', hint: 'workbenchTasksHint', count: tasks.length },
  ]
  const next: Array<{ destination: Destination; icon: ProfileIconName; labelKey: EnterpriseKey; hint: EnterpriseKey }> = [
    { destination: 'assets', icon: 'commercial_policy', labelKey: 'assets', hint: 'workbenchUploadHint' },
    { destination: 'opportunities', icon: 'globe', labelKey: 'opportunities', hint: 'workbenchResearchHint' },
    { destination: 'ai', icon: 'sparkle', labelKey: 'ai', hint: 'workbenchCreateHint' },
  ]
  const statuses = { todo: 'taskTodo', in_progress: 'taskInProgress', blocked: 'taskBlocked', done: 'taskDone' } as const
  return <div className="wb-overview">
    <div className="wb-introduction"><div><span className="wb-eyebrow">{t('workbenchLabel')}</span><h2>{t('workbenchTitle')}</h2><p>{t('workbenchHint')}</p></div><span className="wb-private"><ProfileIcon name="evidence" size={15} />{t('workbenchPrivate')}</span></div>
    <div className="wb-metrics">{metrics.map(metric => <button type="button" key={metric.destination} className="wb-metric" onClick={() => navigate(metric.destination)}><span className="wb-metric-top"><span>{t(metric.labelKey)}</span><ProfileIcon name={metric.icon} size={18} /></span><strong>{metric.count}</strong><span className="wb-metric-hint">{t(metric.hint)}<ProfileIcon name="arrow" size={16} /></span></button>)}</div>
    <div className="wb-section-heading"><div><h2>{t('workbenchNext')}</h2><p>{t('workbenchNextHint')}</p></div></div>
    <div className="wb-actions">{next.map(action => <button type="button" className="wb-action" key={action.destination} onClick={() => navigate(action.destination)}><span className="wb-icon"><ProfileIcon name={action.icon} size={22} /></span><strong>{t(action.labelKey)}</strong><span>{t(action.hint)}</span><ProfileIcon name="arrow" size={18} /></button>)}</div>
    <div className="wb-bottom"><section className="wb-card wb-task-list"><header><h2>{t('workbenchTaskList')}</h2><Button size="sm" onClick={() => navigate('tasks')}>{t('workbenchViewTasks')}</Button></header>{tasks.length ? <ul>{tasks.slice(0, 4).map(task => <li key={task.id}><button type="button" onClick={() => navigate('tasks')}><span className="wb-task-dot" data-status={task.status} /><span><strong>{task.title}</strong><small>{task.assignee || t('taskUnassigned')}{task.dueDate ? ` · ${task.dueDate}` : ''}</small></span><span className="wb-task-status" data-status={task.status}>{t(statuses[task.status])}</span></button></li>)}</ul> : <div className="wb-empty"><span className="wb-icon"><ProfileIcon name="case" size={24} /></span><h3>{t('workbenchNoTasks')}</h3><p>{t('workbenchNoTasksHint')}</p><Button onClick={() => navigate('tasks')}>{t('taskCreate')}</Button></div>}</section>
      <aside className="wb-card wb-knowledge"><span className="wb-icon"><ProfileIcon name="company" size={24} /></span><h2>{t('workbenchProfileTitle')}</h2><p>{data.profile?.description || t('workbenchProfileHint')}</p><span className="wb-knowledge-count">{t('knowledgeCount', { ready: data.files.filter(file => file.knowledgeStatus === 'ready').length, total: data.files.length })}</span><Button onClick={() => navigate('supplier')}>{t('workbenchViewProfile')}<ProfileIcon name="arrow" size={16} /></Button></aside></div>
    <p className="wb-footnote">{t('workbenchUpdated')}</p>
  </div>
}
