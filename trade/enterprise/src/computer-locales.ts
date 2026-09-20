/** Product copy for enterprise computer management. */
export const computerZh = {
  title: '企业云电脑', intro: '绑定已有 Grokbot 工位，分配资料与工作，并验收成果。',
  limits: '当前为单企业部署。自动唤醒、远程停止和桌面嵌入尚未验证；请在原生 Grokbot 中启动领取工作。',
  bind: '绑定工位', name: '工位名称', account: '独立供应商账号标识', worker: '岗位名称', nativeUrl: '原生电脑 HTTPS 入口（不含令牌或查询参数）', instructions: '岗位职责与授权规则',
  isolation: '同一账号的 Bot 共享文件和登录态。不同信任范围请使用独立账号；岗位说明不能限制已登录网站的权限。',
  empty: '尚未绑定工位', save: '保存', close: '关闭', refresh: '刷新', error: '操作未完成，请刷新核对状态后再试。',
  credential: '连接凭据（仅本次显示）', credentialHelp: '保存到工位的凭据存储，用作 Authorization: Bearer。不要放入聊天、岗位说明或文件。丢失后可轮换。',
  rotate: '轮换连接凭据', disconnect: '断开连接', disconnectHelp: '断开只撤销平台访问。云端任务可能仍在运行，请在原生电脑核对。',
  connected: '允许连接', disconnected: '已断开', open: '打开原生电脑', create: '分配工作', objective: '任务目标', context: '本次授权上下文（注明资料版本、已确认条件及未知信息）',
  files: '授权读取的企业文件', disclosure: '提交后，工位可领取任务并读取以下上下文和所选完整文件。请仅提供本次必要资料。', outputs: '必需成果（每行一项，逐项上传文件）',
  jobs: '任务与成果', noJobs: '暂无任务', activity: '最近任务回报', noActivity: '尚无回报', health: '任务活动不代表电脑在线状态。',
  cancel: '请求停止', cancelHelp: '已领取的工作须等待执行方确认停止；请同时在原生电脑核对。',
  unknown: '标记待核实', review: '验收结果', verdict: '验收结论', comment: '核对说明', reviewHelp: '请打开成果，核对格式、内容和证据。上传文件和哈希不能证明业务结论正确。',
  approval: '待审批动作', approve: '批准此动作', reject: '拒绝此动作', approvalHelp: '审批仅针对下述动作；源系统和供应商权限仍需单独配置。',
  activityLog: '活动记录', details: '查看详情', input: '授权上下文', taskRef: '企业任务编号', provider: '执行提供方：Grokbot',
  QUEUED: '等待领取', RUNNING: '执行中', WAITING_APPROVAL: '等待审批', WAITING_HUMAN: '等待人工处理', CANCEL_REQUESTED: '已请求停止（待确认）', VERIFYING: '等待验收', SUCCEEDED: '验收通过', PARTIAL: '部分完成', FAILED: '失败', CANCELLED: '已取消', UNKNOWN: '执行状态待核实',
} as const
/** Typed keys shared by both locale dictionaries. */
export type ComputerLocaleKey = keyof typeof computerZh
/** English computer management copy. */
export const computerEn: Record<ComputerLocaleKey, string> = {
  title: 'Enterprise computers', intro: 'Bind an existing Grokbot workstation, assign authorized work and review deliverables.',
  limits: 'Single-enterprise deployment. Automatic wake-up, remote stop and embedded desktop are unverified. Start claiming work in native Grokbot.',
  bind: 'Bind computer', name: 'Computer name', account: 'Dedicated provider account identifier', worker: 'Worker name', nativeUrl: 'Native computer HTTPS URL (no token or query)', instructions: 'Responsibilities and authorization rules',
  isolation: 'Bots on one account share files and sign-ins. Separate trust groups require separate accounts. Instructions cannot restrict signed-in websites.',
  empty: 'No computers bound', save: 'Save', close: 'Close', refresh: 'Refresh', error: 'The operation was not confirmed. Refresh and inspect the state before retrying.',
  credential: 'Connector credential (shown once)', credentialHelp: 'Store as a workstation secret and use Authorization: Bearer. Keep it out of chats, instructions and files. Rotate if lost.',
  rotate: 'Rotate credential', disconnect: 'Disconnect', disconnectHelp: 'Disconnect revokes platform access only. Cloud work may continue; inspect the native computer.',
  connected: 'Connection allowed', disconnected: 'Disconnected', open: 'Open native computer', create: 'Assign work', objective: 'Objective', context: 'Authorized context (include source versions, confirmed terms and unknowns)',
  files: 'Enterprise files granted for reading', disclosure: 'Submitting allows the worker to claim this context and read the selected complete files. Share only necessary information.', outputs: 'Required deliverables (one per line, each requires an uploaded file)',
  jobs: 'Jobs and deliverables', noJobs: 'No jobs', activity: 'Last task report', noActivity: 'No reports', health: 'Task activity does not establish computer health.',
  cancel: 'Request stop', cancelHelp: 'Claimed work requires the worker to confirm stopping. Also inspect the native computer.', unknown: 'Mark uncertain', review: 'Review result', verdict: 'Review decision', comment: 'Verification notes', reviewHelp: 'Open deliverables and check format, content and evidence. Uploads and hashes do not establish factual accuracy.',
  approval: 'Action awaiting approval', approve: 'Approve this action', reject: 'Reject this action', approvalHelp: 'Approval covers only the action below. Provider and source-system permissions require separate configuration.',
  activityLog: 'Activity log', details: 'Details', input: 'Authorized context', taskRef: 'Enterprise task ID', provider: 'Execution provider: Grokbot',
  QUEUED: 'Queued', RUNNING: 'Running', WAITING_APPROVAL: 'Waiting for approval', WAITING_HUMAN: 'Waiting for a person', CANCEL_REQUESTED: 'Stop requested (unconfirmed)', VERIFYING: 'Awaiting review', SUCCEEDED: 'Accepted', PARTIAL: 'Partially completed', FAILED: 'Failed', CANCELLED: 'Cancelled', UNKNOWN: 'Execution uncertain',
}
