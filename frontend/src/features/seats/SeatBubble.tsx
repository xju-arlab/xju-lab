import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

// Shared anchor and viewport handling for API and demo seat cards.
export function SeatBubble({ seatId, svg, onClose, className = '', children }: { seatId: string; svg: RefObject<SVGSVGElement>; onClose: () => void; className?: string; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, side: 'left', pointer: 30, ready: false })
  const closeRef = useRef(onClose); closeRef.current = onClose
  useLayoutEffect(() => {
    const anchor = svg.current?.querySelector<SVGGraphicsElement>(`[data-seat-id="${seatId}"] .desk-surface`)
    if (!anchor || !card.current) return
    const fit = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
    function update() {
      if (!anchor || !card.current) return
      const a = anchor.getBoundingClientRect(), box = card.current.getBoundingClientRect(), w = box.width, h = box.height
      const cx = a.left + a.width / 2, cy = a.top + a.height / 2, gap = 13
      const viewportWidth = document.documentElement.clientWidth, viewportHeight = document.documentElement.clientHeight
      let left: number, top: number, side: string, pointer: number
      if (viewportWidth - a.right >= w + gap + 12) { left = a.right + gap; top = fit(cy - h / 2, 12, viewportHeight - h - 12); side = 'left'; pointer = fit(cy - top, 22, h - 22) }
      else if (a.left >= w + gap + 12) { left = a.left - w - gap; top = fit(cy - h / 2, 12, viewportHeight - h - 12); side = 'right'; pointer = fit(cy - top, 22, h - 22) }
      else {
        left = fit(cx - w / 2, 12, viewportWidth - w - 12)
        if (viewportHeight - a.bottom > h + gap || a.top < h + gap) { top = fit(a.bottom + gap, 12, viewportHeight - h - 12); side = 'top' }
        else { top = fit(a.top - h - gap, 12, viewportHeight - h - 12); side = 'bottom' }
        pointer = fit(cx - left, 22, w - 22)
      }
      setPosition({ left, top, side, pointer, ready: true })
    }
    update()
    const observer = new ResizeObserver(update); observer.observe(card.current); if (svg.current) observer.observe(svg.current)
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [seatId, svg])
  useEffect(() => {
    card.current?.focus({ preventScroll: true })
    function outside(event: PointerEvent) {
      const target = event.target as Element
      if (card.current?.contains(target) || target.closest('.combobox-menu') || target.closest('[data-seat-id]')) return
      closeRef.current()
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('.combobox-menu')) { event.preventDefault(); closeRef.current() }
    }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [])
  return createPortal(<div ref={card} className={'seat-info-bubble pointer-' + position.side + ' ' + className} role="dialog" aria-label={seatId + ' 工位信息'} tabIndex={-1} style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden', '--pointer-offset': position.pointer + 'px' } as CSSProperties}>{children}</div>, document.body)
}
