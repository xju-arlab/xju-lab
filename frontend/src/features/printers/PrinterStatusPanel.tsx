import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import type { components } from '../../api/openapi'
import { useQuery } from '../../api/useQuery'
import { QueryFeedback } from '../../components/common/QueryFeedback'
import { dateText } from '../../lib/date'
import './printers.css'

export type PrinterDevice = components['schemas']['Printer']
export const printerStatusLabels: Record<PrinterDevice['status'], string> = {
  ONLINE: '在线', OFFLINE: '离线', DISABLED: '已停用', STALE: '数据已过期', UNAVAILABLE: '状态暂不可用',
}
const deviceStateLabels: Record<string, string> = { READY: '就绪', BUSY: '使用中', PAPER_OUT: '缺纸', JAMMED: '卡纸', ERROR: '故障', UNKNOWN: '状态未知' }

export function PrinterStatusPanel() {
  const printers = useQuery<PrinterDevice[]>('/printers')
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') printers.reload() }, 15_000)
    return () => window.clearInterval(timer)
  }, [printers.reload])

  return <section className="panel api-panel printer-status-panel" aria-label="打印机状态">
    <div className="section-heading"><h2><Printer size={17} />打印机状态</h2><button className="button button-outline" onClick={printers.reload} disabled={printers.refreshing}>刷新</button></div>
    <QueryFeedback loading={printers.loading} error={printers.error} retry={printers.reload} />
    {printers.data?.map(printer => {
      const report = printer.lastReport
      const current = printer.status === 'ONLINE'
      const old = ['STALE', 'UNAVAILABLE', 'OFFLINE'].includes(printer.status)
      const supplies = report?.supplies ?? []
      return <article className="printer-device" key={printer.id} aria-label={printer.name}>
        <div className="printer-device-heading"><h3>{printer.name}</h3><div className="printer-device-meta"><span className="printer-observed">最近读取 · {dateText(printer.lastSeenAt, '暂无记录')}</span><span className={`tag tag-${current ? 'teal' : 'orange'}`}>{printerStatusLabels[printer.status]}</span></div></div>
        <div className="printer-device-body">
          <div className="printer-info">
            {(report?.model || printer.location) && <div className="printer-model">{[report?.model, printer.location].filter(Boolean).join(' · ')}</div>}
            {old && <p className="printer-stale-note">{printer.status === 'OFFLINE' ? '设备离线' : printerStatusLabels[printer.status]}{printer.lastSeenAt ? '，以下为最近一次读取的信息。' : '，尚未取得设备信息。'}</p>}
            {report && <>
              <div className="printer-details">
                {current && <span className="printer-pill printer-pill-state">{report.stateLabel || deviceStateLabels[report.deviceState] || '状态未知'}</span>}
                {report.paperLabel && <span className={`printer-pill${report.paperEmpty || report.paperLow ? ' printer-warning' : ''}`}>纸张 · {report.paperLabel}</span>}
              </div>
              {report.paperReportsDiffer && <p className="printer-paper-note">设备：{report.devicePaperLabel || '未知'}；队列：{report.queuePaperLabel || '未知'}</p>}
            </>}
          </div>
          {report && <>
          {supplies.length > 0 && <div className="printer-supplies">{supplies.map((supply, index) => {
            const level = supply.levelPercent
            const known = typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 100
            const label = known ? `${report.suppliesApproximate ? '约 ' : ''}${level}%` : '余量未知'
            return <div className={`printer-supply${supply.low ? ' printer-supply-low' : ''}`} key={`${supply.name}-${index}`}>
              <div className="printer-supply-label"><span>{supply.name}</span><strong>{label}</strong></div>
              {known ? <div className="printer-supply-track" role="meter" aria-label={supply.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} aria-valuetext={label}><span style={{ width: `${level}%` }} /></div> : <div className="printer-supply-track printer-supply-unknown" />}
              {supply.low && <small>余量偏低</small>}
            </div>
          })}</div>}
          {printer.source === 'HP_STATUS' && supplies.length === 0 && <p>耗材余量未知</p>}
          {printer.source === 'AGENT' && report.tonerSupported && report.tonerPercent != null && <p>耗材余量 {report.tonerPercent}%</p>}
          </>}
        </div>
      </article>
    })}
    {printers.data?.length === 0 && <div className="empty-state"><Printer size={22} /><p>尚未登记打印机。</p></div>}
  </section>
}
