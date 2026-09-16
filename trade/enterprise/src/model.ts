/** Browser enterprise projection; successful mutations replace the complete server snapshot. */
import { snapshotSchema } from './schema.ts'
import type { Asset, Profile, Snapshot } from './schema.ts'
import type { EnterpriseKey } from './locales.ts'
import { zh } from './locales.ts'
import type { TaskCommand } from './tasks-schema.ts'
import type { OpportunityCommand } from './opportunities-schema.ts'

/** Loading and upload status shared by the profile and asset tabs. */
export interface State {
  data: Snapshot | null
  busy: boolean
  error: EnterpriseKey | null
  progress: { name: string; percent: number } | null
}

function errorKey(value: unknown): EnterpriseKey {
  return typeof value === 'string' && Object.hasOwn(zh, value) ? value as EnterpriseKey : 'serverError'
}

/**
 * Own one browser projection and its cancellable requests.
 * @returns Observable source, commands, and lifecycle disposer.
 */
export function createModel() {
  let state: State = { data: null, busy: false, error: null, progress: null }
  let disposed = false
  const listeners = new Set<() => void>()
  const abort = new AbortController()
  let xhr: XMLHttpRequest | undefined
  const publish = (patch: Partial<State>): void => {
    if (disposed) return
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  const request = async (path: string, body?: unknown): Promise<Snapshot> => {
    const response = await fetch(`/api/enterprise${path}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal: abort.signal,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const result: unknown = await response.json()
    if (!response.ok) throw new Error(typeof result === 'object' && result !== null && 'error' in result ? String(result.error) : 'serverError')
    return snapshotSchema.parse(result)
  }
  const run = async (action: () => Promise<Snapshot>): Promise<boolean> => {
    if (state.busy || disposed) return false
    publish({ busy: true, error: null })
    try { publish({ data: await action() }); return true }
    catch (error) { publish({ error: errorKey(error instanceof Error ? error.message : undefined) }); return false }
    finally { publish({ busy: false, progress: null }) }
  }
  const uploadOne = (file: File): Promise<Snapshot> => new Promise((resolve, reject) => {
    if (file.size > (state.data?.maxFileBytes ?? 0)) { reject(new Error('tooLarge')); return }
    const upload = new XMLHttpRequest()
    xhr = upload
    upload.open('POST', '/api/enterprise/upload')
    upload.setRequestHeader('x-file-name', encodeURIComponent(file.name))
    upload.upload.onprogress = event => publish({ progress: { name: file.name, percent: event.lengthComputable ? Math.round(event.loaded / event.total * 100) : 0 } })
    upload.onload = () => {
      try {
        const result: unknown = JSON.parse(upload.responseText)
        if (upload.status < 200 || upload.status >= 300) throw new Error(typeof result === 'object' && result !== null && 'error' in result ? String(result.error) : 'uploadFailed')
        resolve(snapshotSchema.parse(result))
      } catch (error) { reject(error) }
    }
    upload.onerror = () => reject(new Error('uploadFailed'))
    upload.onabort = () => reject(new Error('uploadFailed'))
    publish({ progress: { name: file.name, percent: 0 } })
    upload.send(file)
  })
  return {
    source: {
      getSnapshot: (): State => state,
      subscribe: (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    load: () => run(() => request('')),
    bindSession: (sessionId: string, expectedRevision: number) => run(() => request('/onboarding/session', { sessionId, expectedRevision })),
    save: (profile: Profile) => run(() => request('/profile', profile)),
    rename: (id: Asset['id'], name: string) => run(() => request('/rename', { id, name })),
    remove: (id: Asset['id']) => run(() => request('/delete', { id })),
    task: (command: TaskCommand) => run(() => request('/tasks', command)),
    opportunity: (command: OpportunityCommand) => run(() => request('/opportunities', command)),
    upload: (files: File[]) => run(async () => {
      let data = state.data
      if (!data) throw new Error('createFirst')
      for (const file of files) { data = await uploadOne(file); publish({ data }) }
      return data
    }),
    dispose: (): void => { disposed = true; listeners.clear(); abort.abort(); xhr?.abort() },
  }
}
