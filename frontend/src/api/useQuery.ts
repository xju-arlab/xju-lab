import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { apiRequest } from './client'
import { queryCache, queryTtl } from './queryCache'

async function readQuery<T>(path: string) {
  try { return await apiRequest<T>(path, { signal: AbortSignal.timeout(20_000) }) }
  catch (reason) { if (reason instanceof DOMException && reason.name === 'TimeoutError') throw new Error('读取超时，请重试。'); throw reason }
}

export function useQuery<T>(path: string | null) {
  useSyncExternalStore(queryCache.subscribe, queryCache.getRevision)
  const scope = queryCache.getScope()
  const invalidation = queryCache.getInvalidation()
  const expired = queryCache.isExpired(path)
  const state = queryCache.read<T>(path)
  const reload = useCallback(() => {
    if (path) void queryCache.load(path, () => readQuery<T>(path), queryTtl(path), true)
  }, [path])
  useEffect(() => {
    if (path) void queryCache.load(path, () => readQuery<T>(path), queryTtl(path))
  }, [path, scope, invalidation, expired])
  useEffect(() => {
    const revalidate = () => {
      if (path && document.visibilityState === 'visible') void queryCache.load(path, () => readQuery<T>(path), queryTtl(path))
    }
    window.addEventListener('focus', revalidate)
    return () => window.removeEventListener('focus', revalidate)
  }, [path])
  return { data: state.data, error: state.error, loading: Boolean(path && !state.data && !state.error), refreshing: state.pending && state.data !== null, reload }
}
