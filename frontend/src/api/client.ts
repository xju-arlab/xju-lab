export type ApiProblem = { code: string; message: string; requestId: string; fieldErrors?: Record<string, string> }

export class ApiError extends Error {
  constructor(readonly status: number, readonly problem: ApiProblem) { super(problem.message); this.name = 'ApiError' }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }
let csrfPromise: Promise<{ headerName: string; token: string }> | undefined

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
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type Session = { authenticated: true; memberId: string; displayName: string; roles: string[]; issuer: string }
export const getSession = () => apiRequest<Session>('/session')
export const loginUrl = () => '/oauth2/authorization/lab'
