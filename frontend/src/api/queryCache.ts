export type QueryState<T = unknown> = { data: T | null; pending: boolean; error: string; updatedAt: number }
type Entry = QueryState & { token: number; stale?: boolean; promise?: Promise<void> }
const empty: QueryState = { data: null, pending: false, error: '', updatedAt: 0 }

/** Only page reads opt in. Nothing is persisted to browser storage. */
export class QueryCache {
  private entries = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private scope = 'anonymous'
  private revision = 0
  private invalidation = 0
  private token = 0
  private readonly now: () => number
  private readonly limit: number
  private readonly retention: number
  constructor(now = Date.now, limit = 120, retention = 300_000) { this.now = now; this.limit = limit; this.retention = retention }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getRevision = () => this.revision
  getInvalidation = () => this.invalidation
  getScope = () => this.scope
  isExpired(path: string | null) {
    const entry = path ? this.entries.get(this.key(path)) : undefined
    return Boolean(entry && !entry.pending && entry.data !== null && this.now() - entry.updatedAt >= this.retention)
  }
  isPending = () => [...this.entries.values()].some(entry => entry.pending)
  private emit() { this.revision++; this.listeners.forEach(listener => listener()) }
  private key(path: string) { return `${path === '/public/snapshot' ? 'public' : this.scope}:${path}` }
  setScope(scope: string) {
    if (this.scope === scope) return
    this.scope = scope
    for (const key of this.entries.keys()) if (!key.startsWith('public:')) this.entries.delete(key)
    this.emit()
  }
  read<T>(path: string | null): QueryState<T> {
    const entry = path ? this.entries.get(this.key(path)) : undefined
    return (entry && (entry.pending || entry.error || this.now() - entry.updatedAt < this.retention) ? entry : empty) as QueryState<T>
  }
  isFresh(path: string, ttl: number) {
    const entry = this.entries.get(this.key(path))
    return Boolean(entry && !entry.stale && entry.data !== null && this.now() - entry.updatedAt < ttl)
  }
  invalidate() {
    // Preserve visible content during revalidation; superseded responses cannot refill the cache.
    for (const entry of this.entries.values()) { entry.stale = true; entry.token = ++this.token; entry.pending = false; entry.promise = undefined }
    this.invalidation++
    this.emit()
  }
  clearPrivate(message = '') {
    for (const [key, entry] of this.entries) if (!key.startsWith('public:')) {
      this.entries.set(key, { ...entry, token: ++this.token, data: null, pending: false, promise: undefined, error: message, updatedAt: 0 })
    }
    this.emit()
  }
  load<T>(path: string, fetcher: () => Promise<T>, ttl: number, force = false): Promise<void> {
    const key = this.key(path)
    const previous = this.entries.get(key)
    if (previous?.pending && previous.promise) return previous.promise
    if (!force && this.isFresh(path, ttl)) return Promise.resolve()
    const entry: Entry = { ...this.read(path), pending: true, error: '', token: ++this.token }
    this.entries.delete(key)
    this.entries.set(key, entry)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
    const token = entry.token
    const current = () => this.entries.get(key) === entry && entry.token === token
    const promise = Promise.resolve().then(fetcher).then(data => {
      if (current()) Object.assign(entry, { data, pending: false, stale: false, error: '', updatedAt: this.now(), promise: undefined })
    }).catch((reason: unknown) => {
      if (!current()) return
      const error = reason instanceof Error ? reason.message : '服务暂时不可用，请稍后重试。'
      if (typeof reason === 'object' && reason && 'status' in reason && (reason.status === 401 || reason.status === 403)) this.clearPrivate(error)
      else Object.assign(entry, { data: null, pending: false, error, updatedAt: 0, promise: undefined })
    }).finally(() => this.emit())
    entry.promise = promise
    this.emit()
    return promise
  }
}

export const queryCache = new QueryCache()
export function queryTtl(path: string) {
  if (path.includes('/imports/')) return 0
  if (path.includes('/metrics') || path.includes('/series?') || path.includes('/printers')) return 5_000
  return 30_000
}
