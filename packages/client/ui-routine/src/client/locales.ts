/** `routine.center` namespace dictionaries. */
export const NS = 'routine.center'

export const zh = {
  'trigger': 'Routine',
  'panel.title': 'Routine',
  'panel.subtitle': '未来启动独立会话执行',
  'create': '新建 Routine',
  'empty': '还没有 Routine',
  'emptyHint': '创建一个定时任务，让独立会话在未来执行。',
  'status.active': '已启用',
  'status.running': '运行中',
  'status.succeeded': '已完成',
  'status.failed': '失败',
  'status.interrupted': '已中断',
  'status.queued': '排队中',
  'status.deleted': '已删除',
  'schedule.once': '单次执行',
  'schedule.interval': '每 {seconds} 秒',
  'nextRun': '下次 {time}',
  'lastRun': '最近一次 {time}',
  'openSession': '打开执行会话',
  'runNow': '立即运行',
  'aria': 'Routine 管理中心',
} as const

export const en: Record<RoutineKey, string> = {
  'trigger': 'Routines',
  'panel.title': 'Routines',
  'panel.subtitle': 'Independent Sessions that run in the future',
  'create': 'New Routine',
  'empty': 'No Routines yet',
  'emptyHint': 'Create a scheduled task for an independent Session.',
  'status.active': 'Active',
  'status.running': 'Running',
  'status.succeeded': 'Completed',
  'status.failed': 'Failed',
  'status.interrupted': 'Interrupted',
  'status.queued': 'Queued',
  'status.deleted': 'Deleted',
  'schedule.once': 'Runs once',
  'schedule.interval': 'Every {seconds} seconds',
  'nextRun': 'Next {time}',
  'lastRun': 'Last run {time}',
  'openSession': 'Open execution Session',
  'runNow': 'Run now',
  'aria': 'Routine Center',
}

export type RoutineKey = keyof typeof zh
