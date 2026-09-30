import { useSyncExternalStore } from 'react'
import { queryCache } from '../../api/queryCache'

export function QueryProgress() {
  useSyncExternalStore(queryCache.subscribe, queryCache.getRevision)
  const pending = queryCache.isPending()
  return <div className={`api-query-progress${pending ? ' is-loading' : ''}`} aria-hidden="true"><span /></div>
}
