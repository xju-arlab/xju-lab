const EXPORT_PADDING = 40
const BACKGROUND_COLOR = '#fafbf8'

// Measure rendered artwork, including strokes and rotated furniture, in SVG units.
// The background, selection rings and editor handles must not contribute to the crop.
function artworkBounds(svg: SVGSVGElement) {
  const inverse = svg.getScreenCTM()?.inverse()
  if (!inverse) throw new Error('无法测量平面图')
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const shape of svg.querySelectorAll<SVGGraphicsElement>('[data-plan-content] path, [data-plan-content] rect, [data-plan-content] circle, [data-plan-content] text')) {
    if (shape.closest('defs')) continue
    const bounds = shape.getBBox(), matrix = shape.getScreenCTM()
    if (!matrix) continue
    const style = getComputedStyle(shape)
    const stroke = style.stroke !== 'none' ? (parseFloat(style.strokeWidth) || 0) / 2 : 0
    const transform = inverse.multiply(matrix)
    for (const x of [bounds.x - stroke, bounds.x + bounds.width + stroke]) {
      for (const y of [bounds.y - stroke, bounds.y + bounds.height + stroke]) {
        const point = new DOMPoint(x, y).matrixTransform(transform)
        left = Math.min(left, point.x); right = Math.max(right, point.x)
        top = Math.min(top, point.y); bottom = Math.max(bottom, point.y)
      }
    }
  }
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) throw new Error('平面图为空')
  const clean = (value: number) => Math.round(value * 1e6) / 1e6
  return { x: clean(left - EXPORT_PADDING), y: clean(top - EXPORT_PADDING), width: clean(right - left + EXPORT_PADDING * 2), height: clean(bottom - top + EXPORT_PADDING * 2) }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function createFloorPlanExport(svg: SVGSVGElement, format: 'svg' | 'png') {
  await document.fonts.ready
  const copy = svg.cloneNode(true) as SVGSVGElement
  // Remove page-only padding/borders so exports depend solely on the artwork.
  copy.removeAttribute('class')
  copy.removeAttribute('tabindex')
  copy.style.cssText = `display:block;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;padding:0;margin:0;border:0;font-family:${svg.style.fontFamily}`
  copy.setAttribute('aria-hidden', 'true')
  copy.querySelectorAll('style').forEach(item => item.remove())
  copy.querySelectorAll('[data-editor-only]').forEach(item => item.remove())
  copy.querySelector('.plan-tool-area rect')?.setAttribute('stroke', '#9aab88')
  copy.querySelectorAll('[data-structure]').forEach(item => { item.removeAttribute('role'); item.removeAttribute('tabindex'); item.removeAttribute('aria-pressed') })
  // Always export the complete room, independent of the current search and selection.
  copy.querySelectorAll('[data-seat-id]').forEach(desk => {
    desk.setAttribute('opacity', '1')
    desk.removeAttribute('tabindex')
    desk.removeAttribute('role')
    desk.removeAttribute('aria-pressed')
    desk.querySelector('.desk-focus')?.remove()
    const surface = desk.querySelector('.desk-surface')
    surface?.setAttribute('stroke', desk.getAttribute('data-export-stroke') ?? '#b7bab0')
    surface?.setAttribute('stroke-width', '1.3')
  })
  document.body.append(copy)
  let frame: ReturnType<typeof artworkBounds>
  try { frame = artworkBounds(copy) } finally { copy.remove() }
  copy.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.width} ${frame.height}`)
  copy.setAttribute('width', String(frame.width))
  copy.setAttribute('height', String(frame.height))
  copy.style.cssText = `display:block;font-family:${svg.style.fontFamily}`
  copy.removeAttribute('aria-hidden')
  const background = copy.querySelector('[data-plan-background]')!
  for (const [key, value] of Object.entries(frame)) background.setAttribute(key, String(value))
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' })
  if (format === 'svg') return { blob, width: frame.width, height: frame.height }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(frame.width * 2)
    canvas.height = Math.round(frame.height * 2)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建图片画布')
    context.fillStyle = BACKGROUND_COLOR
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片生成失败')), 'image/png'))
    return { blob: png, width: canvas.width, height: canvas.height }
  } finally { URL.revokeObjectURL(url) }
}

export async function exportFloorPlan(svg: SVGSVGElement, format: 'svg' | 'png') {
  const { blob } = await createFloorPlanExport(svg, format)
  download(blob, `实验室工位平面图.${format}`)
}
