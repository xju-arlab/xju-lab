import { LoaderCircle } from 'lucide-react'

export function LoadingState({ label = '正在读取服务端数据…', compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`api-loading-state${compact ? ' is-compact' : ''}`} role="status"><span className="api-loading-caption"><LoaderCircle size={16} className="api-loading-spinner" />{label}</span>{!compact && <div className="api-loading-lines" aria-hidden="true"><i /><i /><i /></div>}</div>
}

export function QueryFeedback({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <LoadingState />
  if (error) return <div className="api-error" role="alert"><span>{error}</span><button className="button button-outline" onClick={retry}>重试</button></div>
  return null
}
