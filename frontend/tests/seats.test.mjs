import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', cacheDir: 'node_modules/.vite-seat-tests' })
try {
  const m = await server.ssrLoadModule('/src/features/seats/layout.ts')
  const people = await server.ssrLoadModule('/src/features/seats/members.ts')
  const realMember = people.memberForSeat({ id: 'A01', memberId: 'real-id', name: '赵文彪', status: 'occupied', className: '测试专业27-2', grade: 2027, directions: ['新方向'] }, false)
  assert.equal(realMember.className, '测试专业27-2', 'API classes must not fall back to a same-name demo member')
  assert.equal(realMember.grade, 2027)
  assert.deepEqual(realMember.directions, ['新方向'])
  const incompleteRealMember = people.memberForSeat({ id: 'A01', name: '赵文彪', status: 'occupied' }, false)
  assert.equal(incompleteRealMember.className, '')
  assert.equal(incompleteRealMember.grade, undefined)
  assert.deepEqual(incompleteRealMember.directions, [])
  const { initialSeats } = await server.ssrLoadModule('/src/demo.ts')
  const { FloorPlan } = await server.ssrLoadModule('/src/features/seats/FloorPlan.tsx')
  const original = JSON.parse(await readFile(new URL('../../docs/design/lab-layout-calibrated.json', import.meta.url), 'utf8'))
  const normalized = m.normalizeLayout(m.validateLayoutDocument(original))
  assert.deepEqual(normalized, m.defaultLayout, 'confirmed layout must derive from the final calibration')
  assert.deepEqual(m.normalizeLayout(normalized), normalized, 'align twice does not drift')
  assert.equal(m.workstations.length, 31)
  assert.equal(normalized.desks.length, 33)
  for (const prefix of ['A','B','C','D','E','F']) {
    const row = normalized.desks.filter(d => d.id.startsWith(prefix))
    assert.equal(new Set(row.map(d => d.y)).size, 1)
    assert.equal(new Set(row.slice(1).map((d,i) => d.x - row[i].x)).size, 1)
    assert.ok(row.slice(1).every((d,i) => m.deskBounds(d).left > m.deskBounds(row[i]).right))
  }
  for (const [a,b] of [['B','C'],['D','E']]) assert.deepEqual(normalized.desks.filter(d=>d.id.startsWith(a)).map(d=>d.x), normalized.desks.filter(d=>d.id.startsWith(b)).map(d=>d.x))
  for (const prefix of ['G','H']) {
    const row = normalized.desks.filter(d=>d.id.startsWith(prefix))
    assert.equal(new Set(row.map(d=>d.x)).size,1)
    assert.equal(new Set(row.slice(1).map((d,i)=>d.y-row[i].y)).size,1)
  }
  const a = m.deskBounds(normalized.desks.find(d=>d.id==='A01')), i = m.deskBounds(normalized.desks.find(d=>d.id==='I01'))
  assert.equal(normalized.room.toolY, a.top); assert.equal(normalized.room.toolHeight, a.height)
  assert.equal(i.top, m.deskBounds(normalized.desks.find(d=>d.id==='D01')).top)
  assert.equal(i.bottom, m.deskBounds(normalized.desks.find(d=>d.id==='E01')).bottom)
  const moved = m.moveLayout(normalized, { kind:'desk', ids:['B01','C01'] }, 13, 26)
  assert.equal(moved.desks.find(d=>d.id==='B01').x, 380)
  assert.equal(moved.desks.find(d=>d.id==='C01').y, 430)
  assert.deepEqual(moved.room,normalized.room)
  for (const key of Object.keys(m.structureNames)) for (const n of [-2000, 13, 2000]) {
    const next=m.moveLayout(normalized,{kind:'structure',key},n,n)
    assert.deepEqual(m.validateLayoutDocument(m.makeLayoutDocument(next)),next)
  }
  const updated=m.cloneLayout(normalized); updated.desks[0].x+=10; updated.room.toolHeight=76
  assert.deepEqual(m.validateLayoutDocument(m.makeLayoutDocument(updated)),updated)
  const invalid=m.makeLayoutDocument(updated); invalid.desks[0].x=NaN
  assert.throws(()=>m.validateLayoutDocument(invalid))
  assert.throws(()=>m.validateLayoutDocument({...m.makeLayoutDocument(normalized),desks:normalized.desks.slice(1)}))
  const member=people.seatMembers.find(m=>m.name==='何新雨')
  const assigned=people.assignMember(initialSeats,'B01',member)
  assert.equal(people.memberForSeat(assigned.find(s=>s.id==='B01')).className,member.className)
  assert.throws(()=>people.assignMember(assigned,'C03',member))
  assert.throws(()=>people.assignMember(initialSeats,'A05',member))
  assert.throws(()=>people.assignMember(initialSeats,'F05',member))
  assert.equal(people.releaseMember(assigned,'B01').find(s=>s.id==='B01').name,undefined)
  const zhao=people.memberForSeat(initialSeats.find(s=>s.id==='A01'))
  assert.equal(zhao.directions.length,2)
  assert.deepEqual(Object.keys(people.directionPalette), ['算法','深度学习'])
  assert.deepEqual(Object.keys(people.gradeColors), ['2024','2025','2026'])
  assert.equal(new Set([...Object.values(people.directionPalette).map(c=>c.ink),...Object.values(people.gradeColors)]).size,5)
  assert.ok(people.seatMembers.every(m=>m.grade>=2024 && m.grade<=2026 && m.directions.every(d=>d in people.directionPalette)))
  const legacy = people.memberForSeat({id:'A02',name:'林予宁',status:'occupied',grade:2023,className:'计算机23-2',direction:'具身智能'})
  assert.equal(legacy.grade,2025); assert.equal(legacy.className,'计算机25-2'); assert.deepEqual(legacy.directions,['深度学习'])
  assert.notEqual(people.memberColors(zhao).ink,people.memberColors(people.memberForSeat(initialSeats[1])).ink)
  const svg=renderToStaticMarkup(createElement(FloorPlan,{seats:initialSeats,showAssignments:true,onSelect(){}}))
  assert.equal((svg.match(/class="desk-chair"/g)||[]).length,31)
  assert.ok(svg.includes('linearGradient'))
  assert.ok(!svg.includes('图书角'))
  assert.ok(!svg.includes('data-editor-only'))
  console.log('PASS: normalized geometry, tabletop alignment, snap/group movement, wall bounds, persistence validation, member assignment, grade colors and SVG rendering')
} finally { await server.close() }
