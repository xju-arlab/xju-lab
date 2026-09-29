import { structureNames, type Room, type StructureKey } from './layout'

export function doorGeometry(r: Room) {
  if (r.doorWall === 'top') return { x: r.left + r.notchWidth + r.doorOffset + r.doorWidth, y: r.top, angle: 90 }
  return { x: r.doorWall === 'notch' ? r.left + r.notchWidth : r.left, y: r.top + (r.doorWall === 'left' ? r.notchHeight : 0) + r.doorOffset, angle: 0 }
}
export function RoomDrawing({ room: r, patternId, editing, selected }: { room: Room; patternId: string; editing: boolean; selected?: StructureKey }) {
  const nx = r.left + r.notchWidth, ny = r.top + r.notchHeight, wy = r.top + r.windowOffset
  const outline = `M${nx} ${r.top}H${r.right}V${r.bottom}H${r.left}V${ny}H${nx}Z`
  const door = doorGeometry(r), half = r.doorWidth / 2, end = r.doorSide === 'left' ? -half : half
  const wallStart = r.doorWall === 'notch' ? r.top + r.doorOffset + r.doorWidth : r.top
  const hydrantHeight = Math.min(72, ny - wallStart - 4), hydrantY = wallStart + (ny - wallStart - hydrantHeight) / 2
  return <g>
    <defs>
      <pattern id={patternId} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#e2e6dc" strokeWidth=".6" /></pattern>
      <pattern id={patternId + '-snap'} width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".65" fill="#c6d1bd" /></pattern>
      <pattern id={patternId + '-wall'} width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 2L2 -2M0 9L9 0M7 11L11 7" stroke="#c3c9c5" strokeWidth=".7" /></pattern>
    </defs>
    <g aria-label="凸入墙体">
      <rect x={r.left} y={r.top} width={r.notchWidth} height={r.notchHeight} fill="#dce0dd" />
      <rect x={r.left} y={r.top} width={r.notchWidth} height={r.notchHeight} fill={`url(#${patternId}-wall)`} />
      {r.doorWall === 'notch' && <rect x={r.left} y={door.y} width={r.notchWidth} height={r.doorWidth} fill="#fafbf8" />}
    </g>
    <path d={outline} fill="#f4f6ef" stroke="#9ca795" strokeWidth="10" strokeLinejoin="miter" />
    <path d={outline} fill={`url(#${patternId})`} />
    {editing && <path data-editor-only="" d={outline} fill={`url(#${patternId}-snap)`} />}
    <g data-structure="tools" className={editing ? 'plan-tool-area editable' : 'plan-tool-area'} role={editing ? 'button' : 'img'} tabIndex={editing ? 0 : undefined} aria-label={editing ? '调整工具区' : '工具区'}>
      <rect x={r.toolX} y={r.toolY} width={r.toolWidth} height={r.toolHeight} rx="3" fill="#edf0e4" fillOpacity=".45" stroke={selected === 'tools' ? '#47794f' : '#9aab88'} strokeWidth="1.8" strokeDasharray="7 5" />
      <text x={r.toolX + r.toolWidth / 2} y={r.toolY + r.toolHeight / 2 + 5} textAnchor="middle" fill="#82956e" fontSize="14" pointerEvents="none">工具区</text>
    </g>
    <g aria-label="嵌入墙内的消防栓">
      <rect x={nx - 46} y={hydrantY} width="40" height={hydrantHeight} rx="2" fill="#de8f83" stroke="#ad5547" strokeWidth="1.8" />
      <path d={`M${nx - 10} ${hydrantY + hydrantHeight * .35}v${hydrantHeight * .3}`} stroke="#ad5547" strokeWidth="1.5" />
    </g>
    <g className="plan-door" transform={`translate(${door.x} ${door.y}) rotate(${door.angle})`} aria-label={r.doorUpperClosed ? '上扇关闭，下扇开启' : '双扇门开启'}>
      <path d={`M0 0V${r.doorWidth}`} stroke="#fafbf8" strokeWidth="15" />
      <path className="door-leaf" d={`${r.doorUpperClosed ? `M0 0V${half}` : `M0 0H${end}`}M0 ${r.doorWidth}H${end}`} stroke="#90744f" strokeWidth="3" fill="none" />
      <path d={`${r.doorUpperClosed ? '' : `M0 ${half}A${half} ${half} 0 0 ${r.doorSide === 'left' ? 1 : 0} ${end} 0`}M0 ${half}A${half} ${half} 0 0 ${r.doorSide === 'left' ? 0 : 1} ${end} ${r.doorWidth}`} stroke="#b19770" strokeWidth="1.8" strokeDasharray="5 3" fill="none" />
    </g>
    <g className="plan-window" aria-label="右侧窗户">
      <rect x={r.right - 6} y={wy} width="13" height={r.windowLength} fill="#e6f1f1" stroke="#98b9bc" strokeWidth="2" />
      <path d={`M${r.right} ${wy}V${wy + r.windowLength}${[1,2,3,4].map(i => `M${r.right - 5} ${wy + r.windowLength * i / 5}h11`).join('')}`} stroke="#98b9bc" strokeWidth="2" />
    </g>
  </g>
}
export function RoomHandles({ room: r, selected }: { room: Room; selected?: StructureKey }) {
  const nx = r.left + r.notchWidth, ny = r.top + r.notchHeight, wy = r.top + r.windowOffset, door = doorGeometry(r), top = r.doorWall === 'top'
  const handle = (key: StructureKey, x: number, y: number, label: string) => <g key={key} className="plan-room-handle" data-structure={key} role="button" tabIndex={0} aria-label={'调整' + structureNames[key]} aria-pressed={selected === key} transform={`translate(${x} ${y})`}>
    <circle r="17" fill="transparent" /><circle r="6" fill={selected === key ? '#ab7e3f' : '#fffaf0'} stroke="#ab7e3f" strokeWidth="2" />
    {label && <text x="13" y="4" fill="#a07d44" fontSize="11" paintOrder="stroke" stroke="#fafbf8" strokeWidth="3" pointerEvents="none">{label}</text>}
  </g>
  return <g data-editor-only="">
    <path data-structure="notch-x" className="plan-wall-hit" d={`M${nx} ${r.top}V${ny}`} />
    <path data-structure="notch-y" className="plan-wall-hit" d={`M${r.left} ${ny}H${nx}`} />
    <path data-structure="window" className="plan-wall-hit" d={`M${r.right} ${wy}V${wy + r.windowLength}`} />
    {handle('notch', nx, ny, '墙角')}
    {handle('door', top ? door.x - r.doorWidth / 2 : door.x, top ? door.y : door.y + r.doorWidth / 2, '')}
    {handle('door-size', top ? door.x - r.doorWidth : door.x + 32, top ? door.y + 32 : door.y + r.doorWidth, '门宽')}
    {handle('window-start', r.right, wy, '窗上端')}
    {handle('window', r.right, wy + r.windowLength / 2, '窗')}
    {handle('window-end', r.right, wy + r.windowLength, '窗下端')}
    {handle('right', r.right, r.top, '墙线')}
  </g>
}
