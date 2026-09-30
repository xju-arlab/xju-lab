import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Props = { loading: boolean; error: string; hasContent: boolean; contentKey: string; onRetry: () => void; children: ReactNode }

// Keep the space occupied while a new query is pending; never present an old query as new results.
export function AsyncSection({ loading, error, hasContent, contentKey, onRetry, children }: Props) {
  const inner = useRef<HTMLDivElement>(null)
  const lastHeight = useRef(240)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    if (!inner.current) return
    const measure = () => {
      const next = Math.ceil(inner.current!.getBoundingClientRect().height)
      setHeight(next)
      if (!loading && !error) lastHeight.current = next
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(inner.current)
    return () => observer.disconnect()
  }, [loading, error])

  return <section className="api-async-section" aria-label="考核排行" aria-busy={loading} style={{ height }}>
    <div ref={inner} className="api-async-inner" style={loading ? { minHeight: Math.max(240, lastHeight.current) } : undefined}>
      {loading && <span className="sr-only" role="status">正在更新排行…</span>}
      {error ? <div className="api-error" role="alert"><span>{error}</span><button type="button" className="button button-outline" onClick={onRetry}>重试</button></div> : hasContent || !loading ?
        <div key={contentKey} className={'api-async-content' + (loading ? ' is-updating' : '')} {...(loading ? { inert: '' } : {})}>{children}</div> :
        <div className="api-ranking-skeleton" aria-hidden="true"><span />{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><i /><i /></div>)}</div>}
    </div>
  </section>
}
