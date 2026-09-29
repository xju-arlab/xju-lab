import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

function ServiceWorkerNotice() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let active = true
    let registration: ServiceWorkerRegistration | undefined
    let reloading = false
    const onControllerChange = () => { if (!reloading) { reloading = true; window.location.reload() } }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    navigator.serviceWorker.register('/sw.js').then(value => {
      if (!active) return
      registration = value
      if (value.waiting && navigator.serviceWorker.controller) setWaitingWorker(value.waiting)
      value.addEventListener('updatefound', () => {
        const installing = value.installing
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(installing)
        })
      })
    }).catch(() => {})
    return () => { active = false; navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange); void registration }
  }, [])
  if (!waitingWorker) return null
  return <aside className="api-update-notice" role="status"><span>LabOS 有新版本</span><button className="button button-primary" onClick={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })}>更新并重新载入</button></aside>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><App /><ServiceWorkerNotice /></BrowserRouter></React.StrictMode>,
)
