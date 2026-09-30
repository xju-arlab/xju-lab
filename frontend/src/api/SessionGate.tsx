import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { ApiError, clearSessionData, getSession, loginUrl, onAuthFailure, sessionScope, type Session } from './client'
import { queryCache } from './queryCache'
import { LoadingState } from '../components/common/QueryFeedback'

export type SessionCheck = { session: Session | null; error: string }
export async function checkSession(): Promise<SessionCheck> {
  try {
    const session = await getSession()
    queryCache.setScope(sessionScope(session))
    return { session, error: '' }
  } catch (reason) {
    if (reason instanceof ApiError && reason.status === 401) { clearSessionData(); return { session: null, error: '' } }
    if (reason instanceof ApiError && reason.status === 403) clearSessionData()
    throw reason
  }
}
export function plainClick(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

function LoginCard({ checking, error, retry }: { checking: boolean; error: string; retry: () => void }) {
  const [redirecting, setRedirecting] = useState(false)
  useEffect(() => {
    const reset = () => setRedirecting(false)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])
  function login(event: MouseEvent<HTMLAnchorElement>) {
    if (!plainClick(event)) return
    event.preventDefault()
    if (redirecting) return
    setRedirecting(true)
    requestAnimationFrame(() => requestAnimationFrame(() => window.location.assign(loginUrl())))
  }
  return <main className="api-auth-screen"><section className="api-auth-card api-page-enter"><div className="eyebrow">XJU Lab · LabOS</div><h1>算法与科研实验室</h1>{checking ? <LoadingState compact label="正在验证实验室登录状态…" /> : <><p>{error || '请使用实验室统一身份登录。'}</p>{error && <button className="button button-outline" onClick={retry}>重新检查</button>}<a className="button button-primary api-login-button" href={loginUrl()} onClick={login} aria-disabled={redirecting} aria-busy={redirecting}>{redirecting ? <><LoaderCircle size={16} className="api-loading-spinner" /><span role="status">正在前往统一身份认证…</span></> : <>统一身份登录<ArrowRight size={16} /></>}</a><Link className="api-auth-public" to="/">浏览公开主页</Link></>}</section></main>
}

export function SessionGate({ takeInitial, children }: { takeInitial: () => SessionCheck | null; children: (session: Session) => ReactNode }) {
  const [state, setState] = useState<SessionCheck | null>(takeInitial)
  const lastChecked = useRef(state ? Date.now() : 0)
  const active = useRef(true)
  const verifying = useRef(false)
  const location = useLocation()
  const verify = useCallback(async () => {
    if (verifying.current) return
    verifying.current = true
    lastChecked.current = Date.now()
    try { const next = await checkSession(); if (active.current) setState(next) }
    catch (reason) {
      if (active.current) setState(previous => ({ session: previous?.session ?? null, error: reason instanceof Error ? reason.message : '登录状态查询失败，请重试。' }))
    } finally { verifying.current = false }
  }, [])
  useEffect(() => {
    active.current = true
    const focus = () => { if (document.visibilityState === 'visible' && Date.now() - lastChecked.current >= 15_000) void verify() }
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) { clearSessionData(); setState(null); void verify() }
      else focus()
    }
    const unsubscribe = onAuthFailure(status => {
      if (status === 401) { clearSessionData(); setState({ session: null, error: '登录状态已过期，请重新登录。' }) }
      else void verify()
    })
    window.addEventListener('focus', focus)
    window.addEventListener('pageshow', restored)
    return () => { active.current = false; unsubscribe(); window.removeEventListener('focus', focus); window.removeEventListener('pageshow', restored) }
  }, [verify])
  useEffect(() => { if (Date.now() - lastChecked.current >= 15_000) void verify() }, [location.pathname, verify])
  if (!state?.session) return <LoginCard checking={!state} error={state?.error ?? ''} retry={() => { setState(null); void verify() }} />
  return <>{state.error && <div className="api-session-warning" role="alert">登录状态暂时无法确认。<button onClick={() => void verify()}>重试</button></div>}{children(state.session)}</>
}
