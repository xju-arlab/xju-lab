import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryCache, queryTtl } from '../src/api/queryCache.ts'

test('fresh reads reuse data and deduplicate concurrent requests', async () => {
  const cache = new QueryCache(() => 1000)
  let calls = 0
  const fetcher = async () => { calls++; return { count: 4 } }
  await Promise.all([cache.load('/overview', fetcher, 30_000), cache.load('/overview', fetcher, 30_000)])
  await cache.load('/overview', fetcher, 30_000)
  assert.equal(calls, 1)
  assert.deepEqual(cache.read('/overview').data, { count: 4 })
  await cache.load('/overview', fetcher, 30_000, true)
  assert.equal(calls, 2)
})

test('expired reads retain content while refreshing and failures are visible', async () => {
  let now = 1000
  const cache = new QueryCache(() => now)
  await cache.load('/overview', async () => 'old', 100)
  now += 101
  const pending = cache.load('/overview', async () => { throw new Error('offline') }, 100)
  assert.equal(cache.read('/overview').data, 'old')
  assert.equal(cache.read('/overview').pending, true)
  await pending
  assert.equal(cache.read('/overview').data, null)
  assert.equal(cache.read('/overview').error, 'offline')
})

test('mutation invalidates reads and blocks an earlier response from overwriting new data', async () => {
  const cache = new QueryCache()
  let complete!: (value: string) => void
  const old = cache.load('/overview', () => new Promise<string>(resolve => { complete = resolve }), 30_000)
  await Promise.resolve()
  cache.invalidate()
  await cache.load('/overview', async () => 'new', 30_000)
  complete('old'); await old
  assert.equal(cache.read('/overview').data, 'new')
})

test('identity and permission changes discard private reads and late responses', async () => {
  const cache = new QueryCache()
  cache.setScope('member-a:admin')
  await cache.load('/public/snapshot', async () => 'public', 30_000)
  let complete!: (value: string) => void
  const pending = cache.load('/members/me', () => new Promise<string>(resolve => { complete = resolve }), 30_000)
  await Promise.resolve()
  cache.setScope('member-b:member')
  complete('private-a'); await pending
  assert.equal(cache.read('/members/me').data, null)
  assert.equal(cache.read('/public/snapshot').data, 'public')
  await cache.load('/members/me', async () => 'private-b', 30_000)
  cache.setScope('member-b:admin')
  assert.equal(cache.read('/members/me').data, null)
})

test('403 clears private content, shows an error, and never serves cached success', async () => {
  const cache = new QueryCache()
  await cache.load('/overview', async () => 'private', 30_000)
  await cache.load('/admin/members', async () => { throw Object.assign(new Error('forbidden'), { status: 403 }) }, 30_000)
  assert.equal(cache.read('/overview').data, null)
  assert.equal(cache.read('/overview').error, 'forbidden')
  assert.equal(cache.read('/admin/members').error, 'forbidden')
})

test('bounded retention and entry count limit cache growth', async () => {
  let now = 1000
  const cache = new QueryCache(() => now, 2, 300)
  for (const path of ['/a', '/b', '/c']) await cache.load(path, async () => path, 100)
  assert.equal(cache.read('/a').data, null)
  now += 301
  assert.equal(cache.read('/c').data, null)
})

test('monitoring has a short freshness window and import polling stays uncached', () => {
  assert.equal(queryTtl('/overview'), 30_000)
  assert.equal(queryTtl('/monitor/assets/id/metrics'), 5_000)
  assert.equal(queryTtl('/printers'), 5_000)
  assert.equal(queryTtl('/assessment/acm/imports/id'), 0)
})
