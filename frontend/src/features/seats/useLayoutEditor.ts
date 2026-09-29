import { useRef, useState } from 'react'
import { cloneLayout, defaultLayout, LAYOUT_STORAGE_KEY, makeLayoutDocument, validateLayoutDocument, type LayoutState, type LayoutTarget } from './layout'

export function useLayoutEditor(toast: (message: string) => void) {
  const [layout, setLayout] = useState<LayoutState>(() => {
    try { const saved = localStorage.getItem(LAYOUT_STORAGE_KEY); return saved ? validateLayoutDocument(JSON.parse(saved)) : cloneLayout(defaultLayout) }
    catch { return cloneLayout(defaultLayout) }
  })
  const current = useRef(layout)
  const [editing, setEditing] = useState(false)
  const [target, setTarget] = useState<LayoutTarget>()
  const [past, setPast] = useState<LayoutState[]>([])
  const [future, setFuture] = useState<LayoutState[]>([])
  const started = useRef(layout)
  function preview(next: LayoutState) { current.current = next; setLayout(next) }
  function commit(next: LayoutState, before = current.current) {
    if (JSON.stringify(before) === JSON.stringify(next)) return
    setPast(values => [...values.slice(-99), cloneLayout(before)])
    setFuture([]); preview(next)
  }
  function undo() {
    const next = past.at(-1)
    if (!next) return
    setFuture(values => [...values, cloneLayout(current.current)]); setPast(values => values.slice(0, -1)); preview(cloneLayout(next))
  }
  function redo() {
    const next = future.at(-1)
    if (!next) return
    setPast(values => [...values, cloneLayout(current.current)]); setFuture(values => values.slice(0, -1)); preview(cloneLayout(next))
  }
  function start() { started.current = cloneLayout(current.current); setPast([]); setFuture([]); setTarget(undefined); setEditing(true) }
  function save() {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(makeLayoutDocument(current.current)))
      setEditing(false); setTarget(undefined); setPast([]); setFuture([])
      toast('布局调整已保存在当前浏览器')
    } catch { toast('保存失败，请先导出布局文件；当前调整仍保留') }
  }
  function cancel() { preview(cloneLayout(started.current)); setEditing(false); setTarget(undefined); setPast([]); setFuture([]) }
  return { layout, current, editing, target, setTarget, preview, commit, undo, redo, canUndo: !!past.length, canRedo: !!future.length, start, save, cancel }
}
export type LayoutEditor = ReturnType<typeof useLayoutEditor>
