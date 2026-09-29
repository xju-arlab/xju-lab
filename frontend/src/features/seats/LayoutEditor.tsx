import { useEffect, useRef, useState } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import { ComboBox } from '../../components/common/ComboBox'
import { cloneLayout, constrainRoom, defaultLayout, deskBounds, facingLabels, makeLayoutDocument, normalizeLayout, snap, structureNames, validateLayoutDocument, type Facing, type Room } from './layout'
import type { LayoutEditor } from './useLayoutEditor'

function NumberField({ label, value, onCommit, min = 0, max = 1400, step = 10, toast }: { label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; step?: number; toast: (message: string) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  function commit() {
    const n = Number(draft)
    if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) { setDraft(String(value)); toast(`请输入 ${min}–${max} 之间的数值`); return }
    const next = Math.round(n * 10) / 10
    setDraft(String(next)); if (next !== value) onCommit(next)
  }
  return <label>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} /></label>
}
export function LayoutToolbar({ editor, toast }: { editor: LayoutEditor; toast: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  function exportJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(makeLayoutDocument(editor.layout), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = '实验室工位布局.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function importFile(file?: File) {
    if (!file) return
    try { if (file.size > 65536) throw new Error('布局文件过大'); editor.commit(validateLayoutDocument(JSON.parse(await file.text()))); editor.setTarget(undefined); toast('已导入布局，可继续调整后保存') }
    catch (error) { toast(error instanceof Error ? error.message : '无法导入布局文件') }
    finally { if (fileInput.current) fileInput.current.value = '' }
  }
  return <div className="layout-edit-toolbar" aria-label="布局调整工具">
    <div><span className="editing-indicator" />调整中 <small>拖动自动吸附 · Shift 多选</small></div>
    <button aria-label="撤销布局调整" title="撤销" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={15} /></button>
    <button aria-label="重做布局调整" title="重做" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={15} /></button>
    <button onClick={() => { try { editor.commit(validateLayoutDocument(makeLayoutDocument(normalizeLayout(editor.layout)))); toast('同行、同列与墙窗已整理对齐') } catch { toast('当前桌位跨度过大，请先移回画布内再对齐') } }}>整理对齐</button>
    <button onClick={exportJson}>导出布局</button><button onClick={() => fileInput.current?.click()}>导入布局</button>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={event => void importFile(event.target.files?.[0])} />
    <button onClick={() => { editor.commit(cloneLayout(defaultLayout)); toast('已恢复项目标定布局，可撤销') }}>恢复标定</button>
    <div className="layout-edit-save"><button onClick={editor.cancel}>取消</button><button className="save-layout" onClick={editor.save}>保存调整</button></div>
  </div>
}
export function LayoutInspector({ editor, toast }: { editor: LayoutEditor; toast: (message: string) => void }) {
  const { layout, target } = editor
  const desks = target?.kind === 'desk' ? layout.desks.filter(d => target.ids.includes(d.id)) : []
  const single = desks.length === 1 ? desks[0] : undefined
  const structure = target?.kind === 'structure' ? target.key : undefined
  const room = layout.room
  function setRoom<K extends keyof Room>(key: K, value: Room[K]) { editor.commit({ ...layout, room: constrainRoom({ ...room, [key]: value }) }) }
  function changeDesks(change: Partial<{ x: number; y: number; width: number; depth: number; facing: Facing }>) { editor.commit({ ...layout, desks: layout.desks.map(d => desks.some(selected => selected.id === d.id) ? { ...d, ...change } : d) }) }
  const field = (key: keyof Pick<Room, 'notchWidth' | 'notchHeight' | 'doorOffset' | 'doorWidth' | 'windowOffset' | 'windowLength' | 'right' | 'toolX' | 'toolY' | 'toolWidth' | 'toolHeight'>, label: string, min = 0, max = 1400, step = 10) =>
    <NumberField key={key} label={label} value={room[key]} min={min} max={max} step={step} onCommit={n => setRoom(key, n)} toast={toast} />
  return <section className="layout-adjust-panel">
    <div className="detail-topline"><span>布局调整</span><strong>{single?.id ?? (desks.length ? `${desks.length} 个桌位` : structure ? structureNames[structure] : '选择对象')}</strong></div>
    <p>拖动桌位或金色控制点。方向键移动，Shift 加速，R 旋转桌位。</p>
    {!!desks.length && <>
      <div className="layout-fields">
        {single && <><NumberField label="桌位 X" value={single.x} onCommit={x => changeDesks({ x: snap(x) })} toast={toast} /><NumberField label="桌位 Y" value={single.y} max={1060} onCommit={y => changeDesks({ y: snap(y) })} toast={toast} /></>}
        <NumberField label="桌面长度" value={desks[0].width} min={40} max={300} step={.1} onCommit={width => changeDesks({ width })} toast={toast} />
        <NumberField label="桌面深度" value={desks[0].depth} min={30} max={200} step={.1} onCommit={depth => changeDesks({ depth })} toast={toast} />
      </div>
      <label className="layout-select">桌面朝向<ComboBox value={desks[0].facing} onValueChange={value => changeDesks({ facing: value as Facing })} options={Object.entries(facingLabels).map(([value, label]) => ({ value, label }))} /></label>
    </>}
    <h3>整排选择</h3><div className="layout-row-picker">{['A','B','C','D','E','F','G','H','I','B+C','D+E'].map(prefix => <button key={prefix} onClick={() => editor.setTarget({ kind: 'desk', ids: layout.desks.filter(d => prefix.split('+').some(p => d.id.startsWith(p))).map(d => d.id) })}>{prefix}</button>)}</div>
    <div className="layout-structure-picker"><button aria-pressed={!!structure && structure !== 'tools'} onClick={() => editor.setTarget({ kind: 'structure', key: 'notch' })}>墙体与门窗</button><button aria-pressed={structure === 'tools'} onClick={() => editor.setTarget({ kind: 'structure', key: 'tools' })}>工具区</button></div>
    {structure === 'tools' ? <><h3>工具区</h3><div className="layout-fields">{field('toolX', '工具区 X')}{field('toolY', '工具区 Y', 0, 1060)}{field('toolWidth', '工具区宽度', 60, 400)}{field('toolHeight', '工具区高度', 40, 300, 1)}</div><button className="layout-align-tool" onClick={() => { const a = deskBounds(layout.desks.find(d => d.id === 'A01')!); editor.commit({ ...layout, room: constrainRoom({ ...room, toolY: a.top, toolHeight: a.height }) }) }}>与 A01 桌面对齐</button></> : structure && <>
      <h3>墙角</h3><div className="layout-fields">{field('notchWidth', '凸入宽度', 50, 350)}{field('notchHeight', '凸入深度', 100, 350)}</div>
      <h3>入口</h3><div className="layout-fields">{field('doorOffset', '门沿墙偏移')}{field('doorWidth', '总门宽', 50, 240)}</div>
      <label className="layout-select">门所在墙线<ComboBox value={room.doorWall} onValueChange={value => setRoom('doorWall', value as Room['doorWall'])} options={[{ value: 'notch', label: '凸入墙的竖边' }, { value: 'left', label: '左侧墙' }, { value: 'top', label: '上侧墙' }]} /></label>
      <label className="layout-select">门的开向<ComboBox value={room.doorSide} onValueChange={value => setRoom('doorSide', value as Room['doorSide'])} options={[{ value: 'left', label: '向左开启' }, { value: 'right', label: '向右开启' }]} /></label>
      <label className="layout-checkbox"><input type="checkbox" checked={room.doorUpperClosed} onChange={event => setRoom('doorUpperClosed', event.target.checked)} />上方门扇关闭</label>
      <h3>右侧窗户</h3><div className="layout-fields">{field('windowOffset', '窗上端偏移')}{field('windowLength', '窗长', 100, 900)}{field('right', '右侧墙 X', 730, 1330)}</div>
    </>}
    <p className="layout-local-note">保存后在当前浏览器保留。换设备可导出、导入布局文件。</p>
  </section>
}
