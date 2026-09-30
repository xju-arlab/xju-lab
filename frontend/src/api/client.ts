import { queryCache } from './queryCache'

export type ApiProblem = { code: string; message: string; requestId: string; fieldErrors?: Record<string, string> }

export class ApiError extends Error {
  constructor(readonly status: number, readonly problem: ApiProblem) { super(problem.message); this.name = 'ApiError' }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }
let csrfPromise: Promise<{ headerName: string; token: string }> | undefined
const authListeners = new Set<(status: number) => void>()
export function onAuthFailure(listener: (status: number) => void) { authListeners.add(listener); return () => { authListeners.delete(listener) } }
export function clearSessionData() { csrfPromise = undefined; queryCache.clearPrivate(); queryCache.setScope('anonymous') }

async function getCsrf() {
  if (!csrfPromise) {
    csrfPromise = fetch('/api/v1/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw await toApiError(response)
        return response.json() as Promise<{ headerName: string; token: string }>
      }).catch(error => { csrfPromise = undefined; throw error })
  }
  return csrfPromise
}

export async function toApiError(response: Response) {
  const fallback: ApiProblem = { code: 'HTTP_ERROR', message: `请求失败（${response.status}）`, requestId: response.headers.get('X-Request-Id') ?? '' }
  try { return new ApiError(response.status, { ...fallback, ...await response.json() as Partial<ApiProblem> }) }
  catch { return new ApiError(response.status, fallback) }
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  let body: BodyInit | undefined
  if (options.body instanceof FormData || options.body instanceof Blob || typeof options.body === 'string') body = options.body
  else if (options.body !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(options.body) }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await getCsrf()
    headers.set(csrf.headerName, csrf.token)
  }
  const response = await fetch(`/api/v1${path}`, { ...options, method, headers, body, credentials: 'same-origin' })
  if (!response.ok) {
    const error = await toApiError(response)
    if (response.status === 401 || response.status === 403) {
      csrfPromise = undefined
      if (path !== '/session') authListeners.forEach(listener => listener(response.status))
    }
    throw error
  }
  const transientConnection = path.startsWith('/monitor/admin/ssh/') && !path.endsWith('/save')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !transientConnection) queryCache.invalidate()
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type Session = { authenticated: true; memberId: string; displayName: string; roles: string[]; issuer: string; registrationComplete: boolean }
let sessionRequest: Promise<Session> | undefined
export const getSession = () => sessionRequest ??= apiRequest<Session>('/session', { signal: AbortSignal.timeout(15_000) }).finally(() => { sessionRequest = undefined })
export const sessionScope = (session: Session) => JSON.stringify([session.issuer, session.memberId, [...session.roles].sort(), session.registrationComplete])
export const loginUrl = () => '/oauth2/authorization/lab'
export const registrationUrl = () => {
  const url = new URL('https://auth.icthub.top/if/flow/icthub-public-registration/')
  // Authentik accepts relative return paths. Its Lab application launch entry
  // returns to the configured Lab URL without keeping an expiring OIDC request.
  url.searchParams.set('next', '/application/launch/xju-lab/')
  return url.toString()
}
