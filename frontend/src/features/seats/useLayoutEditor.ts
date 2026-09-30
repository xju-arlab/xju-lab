import { useRef, useState } from 'react'
import { cloneLayout, defaultLayout, LAYOUT_STORAGE_KEY, makeLayoutDocument, validateLayoutDocument, type LayoutState, type LayoutTarget } from './layout'

export function useLayoutEditor(toast: (message: string) => void, options?: { persist: (layout: LayoutState) => Promise<void> }) {
  const [layout, setLayout] = useState<LayoutState>(() => {
    if (options) return cloneLayout(defaultLayout)
    try { const saved = localStorage.getItem(LAYOUT_STORAGE_KEY); return saved ? validateLayoutDocument(JSON.parse(saved)) : cloneLayout(defaultLayout) }
    catch { return cloneLayout(defaultLayout) }
  })
  const current = useRef(layout)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
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
  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const next = validateLayoutDocument(makeLayoutDocument(current.current))
      if (options) await options.persist(next)
      else localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(makeLayoutDocument(next)))
      setEditing(false); setTarget(undefined); setPast([]); setFuture([])
      toast(options ? '工位布局已保存' : '布局调整已保存在当前浏览器')
    } catch (error) { toast(error instanceof Error ? error.message : '保存失败，当前调整仍保留') }
    finally { setSaving(false) }
  }
  function cancel() { if (saving) return; preview(cloneLayout(started.current)); setEditing(false); setTarget(undefined); setPast([]); setFuture([]) }
  return { layout, current, editing, saving, serverPersistence: !!options, target, setTarget, preview, commit, undo, redo, canUndo: !!past.length, canRedo: !!future.length, start, save, cancel }
}
export type LayoutEditor = ReturnType<typeof useLayoutEditor>
