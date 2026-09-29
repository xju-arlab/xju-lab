export type OjContestLink = { contestId: string; canonicalUrl: string }

// This is input validation only. The backend must validate again and use its configured OJ adapter.
export function parseOjContestLink(input: string): OjContestLink | null {
  if (!input.trim() || input.length > 2048) return null
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'oj.icthub.top' || url.port || url.username || url.password) return null
    const match = /^\/contest\/([1-9]\d*)(?:\/rank)?\/?$/.exec(url.pathname)
    if (!match || !Number.isSafeInteger(Number(match[1]))) return null
    return { contestId: match[1], canonicalUrl: `https://oj.icthub.top/contest/${match[1]}/rank` }
  } catch { return null }
}
