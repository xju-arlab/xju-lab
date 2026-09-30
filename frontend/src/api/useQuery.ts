import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { apiRequest } from './client'
import { queryCache, queryTtl } from './queryCache'

export function useQuery<T>(path: string | null) {
  useSyncExternalStore(queryCache.subscribe, queryCache.getRevision)
  const scope = queryCache.getScope()
  const invalidation = queryCache.getInvalidation()
  const state = queryCache.read<T>(path)
  const reload = useCallback(() => {
    if (path) void queryCache.load(path, () => apiRequest<T>(path), queryTtl(path), true)
  }, [path])
  useEffect(() => {
    if (path) void queryCache.load(path, () => apiRequest<T>(path), queryTtl(path))
  }, [path, scope, invalidation])
  useEffect(() => {
    const revalidate = () => {
      if (path && document.visibilityState === 'visible') void queryCache.load(path, () => apiRequest<T>(path), queryTtl(path))
    }
    window.addEventListener('focus', revalidate)
    return () => window.removeEventListener('focus', revalidate)
  }, [path])
  return { data: state.data, error: state.error, loading: Boolean(path && !state.data && !state.error), refreshing: state.pending && state.data !== null, reload }
}
